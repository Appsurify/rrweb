"""Audit a Playwright rrweb report for external-resource self-containment.

The question this answers: with the recorder's *default* options, do external
resources actually get baked into the snapshot, or does the replay still depend
on the live site?

Concretely it classifies, across every FullSnapshot and every mutation-add in
the stream:

  <link rel=stylesheet>  -> INLINED  (attributes._cssText present, href/rel dropped)
                            REMOTE   (href kept, no _cssText -> replay re-fetches)
  <style>                -> has _cssText?
  <img>                  -> INLINED  (attributes.rr_dataURL present)
                            REMOTE   (http(s) src, no rr_dataURL)
                            DATA-URI (src already a data: URL)

It also counts attribute-mutations that set `_cssText` AFTER the snapshot — i.e.
whether a late-loading stylesheet is ever "repaired" into the stream. (With the
current StylesheetManager that listener is a TODO no-op, so this is expected 0.)

Usage:
    # all reports for the ffbc spec (default)
    python3 scripts/analyze_stylesheet_inlining.py

    # a single report
    python3 scripts/analyze_stylesheet_inlining.py --file <path.json>

    # a different spec dir, and dump every remote stylesheet URL
    python3 scripts/analyze_stylesheet_inlining.py --spec goback-snapshot.spec.ts --list-remote

Exit code: 0 if every stylesheet link in every report is inlined, 1 otherwise.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text


# rrweb event enums — mirrored from packages/types/src/index.ts
class EventType:
    DOM_CONTENT_LOADED = 0
    LOAD = 1
    FULL_SNAPSHOT = 2
    INCREMENTAL_SNAPSHOT = 3
    META = 4
    CUSTOM = 5
    PLUGIN = 6


class IncrementalSource:
    MUTATION = 0


# rrweb-snapshot NodeType — mirrored from packages/rrweb-snapshot/src/types.ts
class NodeType:
    DOCUMENT = 0
    DOCUMENT_TYPE = 1
    ELEMENT = 2
    TEXT = 3
    CDATA = 4
    COMMENT = 5


REPORT_ROOT = (
    Path(__file__).resolve().parent.parent
    / "test-results" / "playwright" / "ui"
)
DEFAULT_SPEC = "ffbc-primavera-goback.spec.ts"

console = Console()


# -----------------------------------------------------------------------------
# Node walking
# -----------------------------------------------------------------------------

def walk_elements(node: Any) -> Iterator[dict[str, Any]]:
    """Yield every element node (NodeType.ELEMENT) in a serialized subtree."""
    if not isinstance(node, dict):
        return
    if node.get("type") == NodeType.ELEMENT:
        yield node
    for child in node.get("childNodes") or []:
        yield from walk_elements(child)


def iter_snapshot_roots(events: list[dict[str, Any]]) -> Iterator[tuple[int, str, str, dict]]:
    """Yield (event_index, kind, href_context, root_node) for every serialized
    DOM subtree in the stream — both FullSnapshots and the `node` of each
    mutation `add`. `href_context` is the most recent META href seen so far."""
    current_href = "(no meta yet)"
    for i, e in enumerate(events):
        etype = e.get("type")
        data = e.get("data") or {}
        if etype == EventType.META:
            current_href = data.get("href") or current_href
        elif etype == EventType.FULL_SNAPSHOT:
            root = data.get("node")
            if isinstance(root, dict):
                yield i, "FullSnapshot", current_href, root
        elif etype == EventType.INCREMENTAL_SNAPSHOT and data.get("source") == IncrementalSource.MUTATION:
            for add in data.get("adds") or []:
                node = (add or {}).get("node")
                if isinstance(node, dict):
                    yield i, "mutation-add", current_href, node


def collect_csstext_repaired_ids(events: list[dict[str, Any]]) -> set[int]:
    """Return node ids that receive a `_cssText` via an attribute mutation — i.e.
    stylesheets inlined into the stream AFTER the snapshot. This is how
    cross-origin CSS (fetched asynchronously by `inlineStylesheet: 'all'`) and
    late-loading same-origin CSS get repaired: serialization is synchronous, so
    they cannot appear in the FullSnapshot node itself, only as a follow-up
    mutation that the replayer promotes <link>+_cssText into an inline <style>."""
    ids: set[int] = set()
    for e in events:
        if e.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = e.get("data") or {}
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for attr in data.get("attributes") or []:
            if isinstance(attr, dict) and "_cssText" in (attr.get("attributes") or {}):
                node_id = attr.get("id")
                if isinstance(node_id, int):
                    ids.add(node_id)
    return ids


# -----------------------------------------------------------------------------
# Classification
# -----------------------------------------------------------------------------

def is_stylesheet_link(attrs: dict[str, Any]) -> bool:
    rel = attrs.get("rel")
    if isinstance(rel, str):
        return "stylesheet" in rel.lower()
    return False


def short_url(url: str, width: int = 90) -> str:
    if len(url) <= width:
        return url
    return url[: width - 1] + "…"


class ReportStats:
    def __init__(self, name: str) -> None:
        self.name = name
        self.css_inlined = 0          # <link> with _cssText in the snapshot node
        self.css_remote: list[tuple[str, str, int]] = []  # (href, href_context, node_id)
        self.repaired_ids: set[int] = set()  # ids inlined via a later _cssText mutation
        self.style_inlined = 0
        self.style_empty = 0          # <style> with no _cssText (rare)
        self.img_inlined = 0
        self.img_remote: list[tuple[str, str]] = []
        self.img_datauri = 0
        self.late_csstext = 0
        self.snapshot_count = 0
        self.mutation_add_subtrees = 0

    # --- reconciliation: a snapshot-remote <link> repaired by a later _cssText
    #     mutation (cross-origin async fetch) is effectively inlined ---
    @property
    def css_repaired(self) -> list[tuple[str, str, int]]:
        return [r for r in self.css_remote if r[2] in self.repaired_ids]

    @property
    def css_remote_unrepaired(self) -> list[tuple[str, str, int]]:
        return [r for r in self.css_remote if r[2] not in self.repaired_ids]

    @property
    def css_total(self) -> int:
        return self.css_inlined + len(self.css_remote)

    @property
    def img_total(self) -> int:
        return self.img_inlined + len(self.img_remote) + self.img_datauri


def analyze(events: list[dict[str, Any]], name: str) -> ReportStats:
    st = ReportStats(name)
    st.repaired_ids = collect_csstext_repaired_ids(events)
    st.late_csstext = len(st.repaired_ids)

    for _idx, kind, href_ctx, root in iter_snapshot_roots(events):
        if kind == "FullSnapshot":
            st.snapshot_count += 1
        else:
            st.mutation_add_subtrees += 1

        for el in walk_elements(root):
            tag = el.get("tagName")
            attrs = el.get("attributes") or {}

            if tag == "link":
                if "_cssText" in attrs:
                    st.css_inlined += 1
                elif is_stylesheet_link(attrs):
                    href = attrs.get("href") or "(no href)"
                    node_id = el.get("id")
                    st.css_remote.append(
                        (href, href_ctx, node_id if isinstance(node_id, int) else -1)
                    )
                # other links (icon/preload/dns-prefetch) ignored

            elif tag == "style":
                if "_cssText" in attrs:
                    st.style_inlined += 1
                else:
                    st.style_empty += 1

            elif tag == "img":
                if "rr_dataURL" in attrs:
                    st.img_inlined += 1
                else:
                    src = attrs.get("src")
                    if isinstance(src, str) and src.startswith("data:"):
                        st.img_datauri += 1
                    elif isinstance(src, str) and (src.startswith("http://") or src.startswith("https://")):
                        st.img_remote.append((src, href_ctx))

    return st


# -----------------------------------------------------------------------------
# Printing
# -----------------------------------------------------------------------------

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_report_detail(st: ReportStats, list_remote: bool) -> None:
    console.print()
    console.print(f"[bold]{st.name}[/bold]")
    console.print(
        f"  [dim]{st.snapshot_count} FullSnapshot(s), "
        f"{st.mutation_add_subtrees} mutation-add subtree(s)[/dim]"
    )

    table = Table(show_header=True, header_style="bold magenta", box=None, pad_edge=False)
    table.add_column("Resource")
    table.add_column("Inlined", justify="right", style="green")
    table.add_column("Repaired", justify="right", style="cyan")
    table.add_column("Remote", justify="right", style="red")
    table.add_column("Other", justify="right", style="dim")

    table.add_row(
        "<link rel=stylesheet>",
        str(st.css_inlined),
        str(len(st.css_repaired)),
        str(len(st.css_remote_unrepaired)),
        "",
    )
    table.add_row(
        "<style>",
        str(st.style_inlined),
        "",
        "",
        f"{st.style_empty} empty" if st.style_empty else "",
    )
    table.add_row(
        "<img>",
        str(st.img_inlined),
        "",
        str(len(st.img_remote)),
        f"{st.img_datauri} data:" if st.img_datauri else "",
    )
    console.print(table)
    console.print(
        "  [dim]Inlined = in the FullSnapshot node; "
        "Repaired = cross-origin/late CSS inlined via a later _cssText mutation "
        f"({st.late_csstext} repair mutation(s))[/dim]"
    )

    if list_remote and st.css_repaired:
        seen_r: dict[str, str] = {}
        for href, ctx, _id in st.css_repaired:
            seen_r.setdefault(href, ctx)
        console.print("  [cyan]Repaired via async fetch (now self-contained):[/cyan]")
        for href in seen_r:
            console.print(f"    [cyan]•[/cyan] {short_url(href)}")
    if list_remote and st.css_remote_unrepaired:
        console.print("  [red]Still remote (replay will re-fetch):[/red]")
        seen: dict[str, str] = {}
        for href, ctx, _id in st.css_remote_unrepaired:
            seen.setdefault(href, ctx)
        for href in seen:
            console.print(f"    [red]•[/red] {short_url(href)}")
    if list_remote and st.img_remote:
        seen_i: dict[str, str] = {}
        for src, ctx in st.img_remote:
            seen_i.setdefault(src, ctx)
        console.print(f"  [yellow]Remote images ({len(seen_i)} unique):[/yellow]")
        for src in list(seen_i)[:15]:
            console.print(f"    [yellow]•[/yellow] {short_url(src)}")
        if len(seen_i) > 15:
            console.print(f"    [dim]… +{len(seen_i) - 15} more[/dim]")


def print_aggregate(stats: list[ReportStats]) -> int:
    print_header("AGGREGATE — STYLESHEET / RESOURCE INLINING")

    css_inlined = sum(st.css_inlined for st in stats)
    css_repaired = sum(len(st.css_repaired) for st in stats)
    css_remote = [r for st in stats for r in st.css_remote_unrepaired]
    img_inlined = sum(st.img_inlined for st in stats)
    img_remote = sum(len(st.img_remote) for st in stats)
    img_datauri = sum(st.img_datauri for st in stats)
    late = sum(st.late_csstext for st in stats)
    snaps = sum(st.snapshot_count for st in stats)
    css_self_contained = css_inlined + css_repaired
    css_total = css_self_contained + len(css_remote)

    def pct(inl: int, total: int) -> str:
        return f"{(100.0 * inl / total):.0f}%" if total else "—"

    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("Resource")
    table.add_column("Inlined", justify="right", style="green")
    table.add_column("Repaired", justify="right", style="cyan")
    table.add_column("Remote", justify="right", style="red")
    table.add_column("Self-contained %", justify="right")

    table.add_row("<link rel=stylesheet>", str(css_inlined), str(css_repaired),
                  str(len(css_remote)), pct(css_self_contained, css_total))
    table.add_row("<img>", str(img_inlined), "", str(img_remote),
                  pct(img_inlined, img_inlined + img_remote))
    console.print(table)
    console.print(
        f"[dim]across {len(stats)} report(s), {snaps} FullSnapshot(s); "
        f"async _cssText repairs: {late}; {img_datauri} data:-URI img(s)[/dim]"
    )

    # Which hosts stay remote (after reconciliation)?
    if css_remote:
        hosts = Counter(urlsplit(h).netloc for h, _c, _i in css_remote)
        console.print()
        console.print("[red]Still-remote stylesheet hosts:[/red]")
        for host, n in hosts.most_common():
            console.print(f"  [red]•[/red] {host}: {n}")

    print_header("VERDICT")
    if not css_remote:
        console.print(
            f"[bold green]PASS — every stylesheet link is self-contained "
            f"({css_inlined} inlined in-snapshot + {css_repaired} repaired via async "
            f"fetch). No external CSS dependency.[/bold green]"
        )
        return 0
    console.print(
        f"[bold red]FAIL — {len(css_remote)} stylesheet link(s) still remote; "
        f"{css_self_contained}/{css_total} self-contained "
        f"({pct(css_self_contained, css_total)}).[/bold red]"
    )
    console.print(
        "[red]Replay depends on the live site for these stylesheets.[/red] "
        "[dim]Re-run with --list-remote to see the URLs.[/dim]"
    )
    return 1


# -----------------------------------------------------------------------------
# Report discovery
# -----------------------------------------------------------------------------

def discover_reports(args: argparse.Namespace) -> list[Path]:
    if args.file:
        return [args.file]
    spec_dir = REPORT_ROOT / args.spec if args.spec else (REPORT_ROOT / DEFAULT_SPEC)
    base = args.dir or spec_dir
    if not base.exists():
        console.print(f"[bold red]No report dir:[/bold red] {base}")
        console.print(f"[dim]Run the test first to generate reports under {REPORT_ROOT}[/dim]")
        sys.exit(2)
    return sorted(base.rglob("*.json"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--file", "-f", type=Path, help="Single JSON report")
    g.add_argument("--spec", type=str, help=f"Spec dir name under {REPORT_ROOT} (default: {DEFAULT_SPEC})")
    g.add_argument("--dir", type=Path, help="Arbitrary dir to scan recursively for *.json")
    parser.add_argument("--list-remote", action="store_true",
                        help="Print every remote stylesheet/image URL per report")
    args = parser.parse_args()

    print_header("STYLESHEET / RESOURCE INLINING AUDIT")
    reports = discover_reports(args)
    if not reports:
        console.print("[yellow]No report JSON files found.[/yellow]")
        sys.exit(2)
    console.print(f"[green]Reports:[/green] {len(reports)}")

    stats: list[ReportStats] = []
    for path in reports:
        try:
            data = json.load(open(path, "r", encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            console.print(f"[red]skip {path.name}: {exc}[/red]")
            continue
        events = data.get("events") or []
        meta = data.get("metadata") or {}
        rec = (meta.get("runner") or {}).get("recorder") or {}
        name = path.relative_to(REPORT_ROOT).as_posix() if path.is_relative_to(REPORT_ROOT) else path.name
        st = analyze(events, name)
        st.recorder = f"{rec.get('scriptVersion', '?')} / {rec.get('libVersion', '?')}"  # type: ignore[attr-defined]
        stats.append(st)
        print_report_detail(st, args.list_remote)

    code = print_aggregate(stats)
    sys.exit(code)


if __name__ == "__main__":
    main()
