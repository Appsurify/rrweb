"""Analyze a Playwright rrweb report for the "last page lost on goBack" bug.

Walks the event stream of a single JSON report, prints a compact timeline
(META → FullSnapshot → custom Playwright steps → other incrementals), and
explicitly checks: after the LAST Playwright step that contains 'goBack',
is there a FullSnapshot whose META href differs from the pre-goBack URL?

If the answer is no, the recorder lost the post-goBack page state — this
is the bug.

Usage:
    python3 scripts/analyze_goback_capture.py [--file PATH] [--full]

Defaults to the goback-snapshot.spec.ts report under
  test-results/playwright/ui/

Use --full to print every event (huge reports — be careful).
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text


# rrweb enums — mirrored from packages/types/src/index.ts
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
    MOUSE_MOVE = 1
    MOUSE_INTERACTION = 2
    SCROLL = 3
    VIEWPORT_RESIZE = 4
    INPUT = 5
    TOUCH_MOVE = 6
    MEDIA_INTERACTION = 7
    STYLE_SHEET_RULE = 8
    CANVAS_MUTATION = 9
    FONT = 10
    LOG = 11
    DRAG = 12
    STYLE_DECLARATION = 13
    SELECTION = 14
    ADOPTED_STYLE_SHEET = 15
    CUSTOM_ELEMENT = 16
    VISIBILITY = 17


SOURCE_NAMES = {
    0: "mutation", 1: "mousemove", 2: "mouseint", 3: "scroll",
    4: "vp-resize", 5: "input", 6: "touchmove", 7: "media",
    8: "ss-rule", 9: "canvas", 10: "font", 11: "log",
    12: "drag", 13: "style-decl", 14: "selection",
    15: "adopted-ss", 16: "cust-el", 17: "visibility",
}


REPORT_DIR = (
    Path(__file__).resolve().parent.parent
    / "test-results" / "playwright" / "ui"
)
DEFAULT_FILE = (
    REPORT_DIR
    / "goback-snapshot.spec.ts"
    / "chromium"
    / "goBack-snapshot-capture-captures-the-page-state-after-page-goBack.json"
)

console = Console()


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def event_summary(event: dict[str, Any]) -> str:
    etype = event.get("type")
    data = event.get("data") or {}

    if etype == EventType.META:
        href = data.get("href") or "(no href)"
        w = data.get("width"); h = data.get("height")
        return f"META href={href} {w}x{h}"
    if etype == EventType.FULL_SNAPSHOT:
        node = data.get("node") or {}
        nid = node.get("id")
        children = len(node.get("childNodes") or [])
        return f"FULL_SNAPSHOT root_id={nid} top_children={children}"
    if etype == EventType.CUSTOM:
        tag = event.get("data", {}).get("tag") or data.get("tag") or "?"
        payload = event.get("data", {}).get("payload") or {}
        api = payload.get("apiName") or payload.get("title") or tag
        return f"CUSTOM tag={tag!r} apiName={api!r}"
    if etype == EventType.INCREMENTAL_SNAPSHOT:
        src = data.get("source")
        name = SOURCE_NAMES.get(src, f"src={src}")
        if src == IncrementalSource.MUTATION:
            adds = len(data.get("adds") or [])
            removes = len(data.get("removes") or [])
            texts = len(data.get("texts") or [])
            attrs = len(data.get("attributes") or [])
            return f"INCR {name} adds={adds} rem={removes} txt={texts} attr={attrs}"
        return f"INCR {name}"
    if etype == EventType.DOM_CONTENT_LOADED:
        return "DOMContentLoaded"
    if etype == EventType.LOAD:
        return "Load"
    if etype == EventType.PLUGIN:
        plugin = data.get("plugin")
        return f"PLUGIN {plugin}"
    return f"type={etype}"


def iter_meta_href_changes(events: list[dict[str, Any]]) -> Iterable[tuple[int, str]]:
    """Yield (index, href) for each META event, preserving order."""
    for i, e in enumerate(events):
        if e.get("type") == EventType.META:
            href = (e.get("data") or {}).get("href")
            if href:
                yield i, href


def find_last_goback_step(events: list[dict[str, Any]]) -> int | None:
    """Return the index of the last CUSTOM event whose apiName / title
    contains 'goBack' (case-insensitive). None if not present."""
    last_idx: int | None = None
    for i, e in enumerate(events):
        if e.get("type") != EventType.CUSTOM:
            continue
        payload = (e.get("data") or {}).get("payload") or {}
        api = (payload.get("apiName") or payload.get("title") or "") or ""
        tag = (e.get("data") or {}).get("tag") or ""
        joined = f"{api} {tag}".lower()
        if "goback" in joined or "go_back" in joined:
            last_idx = i
    return last_idx


def find_last_meta_before(events: list[dict[str, Any]], idx: int) -> tuple[int, str] | None:
    last: tuple[int, str] | None = None
    for i in range(idx):
        e = events[i]
        if e.get("type") == EventType.META:
            href = (e.get("data") or {}).get("href")
            if href:
                last = (i, href)
    return last


def find_first_full_snapshot_after(events: list[dict[str, Any]], idx: int) -> int | None:
    for i in range(idx + 1, len(events)):
        if events[i].get("type") == EventType.FULL_SNAPSHOT:
            return i
    return None


def find_meta_for_snapshot(events: list[dict[str, Any]], fs_idx: int) -> str | None:
    """Return the closest META href that immediately precedes a FullSnapshot."""
    for i in range(fs_idx, -1, -1):
        if events[i].get("type") == EventType.META:
            return (events[i].get("data") or {}).get("href")
    return None


# -----------------------------------------------------------------------------
# Printing
# -----------------------------------------------------------------------------

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_timeline(events: list[dict[str, Any]], full: bool) -> None:
    """Print one row per 'interesting' event (META / FS / CUSTOM by default,
    or every event with --full)."""
    print_header("EVENT TIMELINE")

    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("#", justify="right", style="dim")
    table.add_column("Δ from prev (ms)", justify="right", style="dim")
    table.add_column("ts", style="dim")
    table.add_column("Summary")

    prev_ts = None
    for i, e in enumerate(events):
        etype = e.get("type")
        if not full and etype not in (
            EventType.META,
            EventType.FULL_SNAPSHOT,
            EventType.CUSTOM,
            EventType.DOM_CONTENT_LOADED,
            EventType.LOAD,
        ):
            continue
        ts = e.get("timestamp", 0)
        delta = "-" if prev_ts is None else str(ts - prev_ts)
        prev_ts = ts
        summary = event_summary(e)
        style = "yellow" if etype == EventType.CUSTOM else (
            "green" if etype == EventType.FULL_SNAPSHOT else (
                "cyan" if etype == EventType.META else ""
            )
        )
        table.add_row(str(i), delta, fmt_ts(ts), Text(summary, style=style))

    console.print(table)


def print_summary(events: list[dict[str, Any]]) -> None:
    print_header("EVENT TYPE COUNTS")
    counts: dict[str, int] = {}
    for e in events:
        et = e.get("type")
        if et == EventType.INCREMENTAL_SNAPSHOT:
            src = (e.get("data") or {}).get("source")
            key = f"INCR/{SOURCE_NAMES.get(src, src)}"
        else:
            key = {
                EventType.DOM_CONTENT_LOADED: "DOMContentLoaded",
                EventType.LOAD: "Load",
                EventType.FULL_SNAPSHOT: "FullSnapshot",
                EventType.META: "META",
                EventType.CUSTOM: "Custom",
                EventType.PLUGIN: "Plugin",
            }.get(et, f"type={et}")
        counts[key] = counts.get(key, 0) + 1

    table = Table(show_header=True)
    table.add_column("Event", style="cyan")
    table.add_column("Count", justify="right")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        table.add_row(k, str(v))
    console.print(table)


def print_meta_progression(events: list[dict[str, Any]]) -> None:
    print_header("META href PROGRESSION")
    rows = list(iter_meta_href_changes(events))
    if not rows:
        console.print("[red]No META events with href found[/red]")
        return
    table = Table(show_header=True)
    table.add_column("META #", justify="right", style="dim")
    table.add_column("Event #", justify="right", style="dim")
    table.add_column("ts", style="dim")
    table.add_column("href", style="cyan")
    for meta_i, (idx, href) in enumerate(rows):
        table.add_row(
            str(meta_i),
            str(idx),
            fmt_ts(events[idx].get("timestamp", 0)),
            href,
        )
    console.print(table)


# -----------------------------------------------------------------------------
# The actual bug check
# -----------------------------------------------------------------------------

def check_goback_snapshot(events: list[dict[str, Any]]) -> int:
    """Return process exit code (0 = bug not present, 1 = bug detected).

    The reliable invariant we check: every META event must have a corresponding
    FullSnapshot AFTER it (until either the next META or end of stream). The
    bug manifests when the LAST META has no following FullSnapshot — meaning
    the recorder saw the URL change but never captured the new DOM.

    We additionally locate the last goBack customEvent (if present) for
    diagnostic context. The customEvent's position relative to META/FS is
    NOT used for verdict, because it depends on waitUntil semantics — only
    the META→FS pairing is a hard contract.
    """
    print_header("goBack POST-NAVIGATION SNAPSHOT CHECK")

    last_goback = find_last_goback_step(events)
    if last_goback is not None:
        console.print(
            f"[dim]Last goBack custom step at event #{last_goback} "
            f"({fmt_ts(events[last_goback].get('timestamp', 0))})[/dim]"
        )
    else:
        console.print("[dim]No 'goBack' custom step found in events.[/dim]")

    # Find unpaired META events: for each META, look forward until the next
    # META or end — if we don't see a FullSnapshot, that META is unpaired.
    meta_indices = [i for i, e in enumerate(events) if e.get("type") == EventType.META]
    if not meta_indices:
        console.print("[yellow]WARN: no META events at all.[/yellow]")
        return 0

    unpaired: list[tuple[int, str]] = []
    for k, mi in enumerate(meta_indices):
        next_meta = meta_indices[k + 1] if k + 1 < len(meta_indices) else len(events)
        has_fs = any(
            events[j].get("type") == EventType.FULL_SNAPSHOT
            for j in range(mi + 1, next_meta)
        )
        if not has_fs:
            href = (events[mi].get("data") or {}).get("href") or "(no href)"
            unpaired.append((mi, href))

    last_meta_idx = meta_indices[-1]
    last_meta_href = (events[last_meta_idx].get("data") or {}).get("href") or "(no href)"
    console.print(
        f"Last META: event #{last_meta_idx} href=[cyan]{last_meta_href}[/cyan]"
    )

    if unpaired:
        console.print(
            f"[bold red]FAIL: {len(unpaired)} META event(s) have no FullSnapshot "
            f"between them and the next META / end of stream.[/bold red]"
        )
        for mi, href in unpaired:
            console.print(f"  [red]META event #{mi}[/red] href={href}")
        console.print(
            "[red]The recorder saw a URL change but never captured the "
            "corresponding DOM.[/red]"
        )
        return 1

    console.print(
        f"[bold green]PASS: all {len(meta_indices)} META events have a "
        f"following FullSnapshot.[/bold green]"
    )
    return 0


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file", "-f", type=Path, default=DEFAULT_FILE,
        help="Path to JSON report file",
    )
    parser.add_argument(
        "--full", action="store_true",
        help="Print every event in the timeline (default: only META/FS/CUSTOM)",
    )
    args = parser.parse_args()

    print_header("goBack SNAPSHOT ANALYZER")
    console.print(f"[bold]File:[/bold] {args.file}")

    if not args.file.exists():
        console.print(f"[bold red]Error: file not found:[/bold red] {args.file}")
        sys.exit(2)

    with open(args.file, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    metadata = data.get("metadata", {})

    console.print(f"[green]Events:[/green] {len(events)}")
    recorder = metadata.get("runner", {}).get("recorder", {})
    if recorder:
        console.print(
            f"[dim]Recorder script: {recorder.get('scriptVersion', '?')} "
            f"/ lib: {recorder.get('libVersion', '?')}[/dim]"
        )

    print_summary(events)
    print_meta_progression(events)
    print_timeline(events, args.full)
    code = check_goback_snapshot(events)
    sys.exit(code)


if __name__ == "__main__":
    main()
