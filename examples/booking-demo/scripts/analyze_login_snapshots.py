"""Analyze FullSnapshot density in the testmaplogin.spec.cy.js report.

Goal: understand why a 4-second login test produces 8 FullSnapshots, classify
each one (initial / navigation / loading-state / data-load), and quantify how
many of them are "redundant" snapshots taken while the SPA was still loading
data.

Usage:
    python scripts/analyze_login_snapshots.py [--file PATH]

Output sections:
  1. Snapshot inventory — table of all FullSnapshots with timing & sizing
  2. Trigger classification — which events preceded each snapshot
  3. Same-URL coalescing potential — pairs that could be merged
  4. Loading-state heuristic — snapshots with abnormally low element count
  5. Recommendation — concrete config tweaks
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

REPORT_DIR = Path(__file__).resolve().parent.parent / "test-results" / "cypress" / "ui"
DEFAULT_FILE = (
    REPORT_DIR
    / "testmaplogin.spec.cy.js"
    / "chrome"
    / "Login-test-logs-in-with-email-and-password.json"
)

console = Console()


class EventType:
    DOM_CONTENT_LOADED = 0
    LOAD = 1
    FULL_SNAPSHOT = 2
    INCREMENTAL_SNAPSHOT = 3
    META = 4
    CUSTOM = 5


SOURCE_NAMES = {
    0: "mut", 1: "mmove", 2: "minteract", 3: "scroll", 4: "resize",
    5: "input", 7: "media", 8: "css", 9: "canvas", 10: "font",
    11: "log", 12: "drag", 13: "styledecl", 14: "sel",
    15: "adopted", 16: "custel", 17: "visibility",
}


def count_elements(node: Any) -> int:
    """Count ELEMENT-type (NodeType=2) nodes recursively."""
    if not isinstance(node, dict):
        return 0
    n = 1 if node.get("type") == 2 else 0
    for child in node.get("childNodes") or []:
        n += count_elements(child)
    return n


def classify_snapshot(elements: int, prev_elements: int | None) -> str:
    """Return a label: initial / loading / data-load / stable / re-snapshot."""
    if prev_elements is None:
        return "initial"
    if elements <= 15:
        return "loading"
    if elements > prev_elements * 1.3:
        return "data-load"
    if abs(elements - prev_elements) <= 5:
        return "re-snapshot"
    return "stable"


def find_trigger(events: list[dict], fs_idx: int) -> dict[str, Any]:
    """Return preceding sources and visibility-mutation count for a FS event."""
    pre = events[max(0, fs_idx - 8) : fs_idx]
    sources: list[str] = []
    vis_count = 0
    for e in pre:
        t = e["type"]
        if t == EventType.INCREMENTAL_SNAPSHOT:
            src = e.get("data", {}).get("source")
            sources.append(SOURCE_NAMES.get(src, str(src)))
            if src == 17:
                vis_count += len(e.get("data", {}).get("mutations", []) or [])
        elif t == EventType.META:
            sources.append("META")
        elif t == EventType.CUSTOM:
            sources.append("CUSTOM")
    return {"sources": sources, "visibility_mutations": vis_count}


def analyze(report_path: Path) -> int:
    with open(report_path, encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    if not events:
        console.print("[red]No events in report[/red]")
        return 1

    base_ts = events[0]["timestamp"]

    fs_events = [(i, e) for i, e in enumerate(events) if e["type"] == EventType.FULL_SNAPSHOT]
    metas = [(i, e) for i, e in enumerate(events) if e["type"] == EventType.META]

    # Map fs_idx → preceding META href
    href_for: dict[int, str] = {}
    for fs_idx, _ in fs_events:
        for ev in reversed(events[: fs_idx + 1]):
            if ev["type"] == EventType.META:
                href_for[fs_idx] = ev.get("data", {}).get("href", "")
                break

    # --- Section 1: Inventory ---
    console.print()
    console.print(Panel(Text("1. SNAPSHOT INVENTORY", style="bold cyan"), expand=False))
    table = Table(show_header=True, show_lines=False)
    table.add_column("FS#", style="dim", justify="right")
    table.add_column("Time", style="dim", justify="right")
    table.add_column("CID", justify="right")
    table.add_column("Elements", justify="right", style="magenta")
    table.add_column("Class", style="yellow")
    table.add_column("Href (path)", max_width=50)

    rows: list[dict] = []
    prev_elements: int | None = None
    for fs_idx, fs in fs_events:
        elements = count_elements(fs.get("data", {}).get("node"))
        cls = classify_snapshot(elements, prev_elements)
        href = href_for.get(fs_idx, "")
        # Show only path part of href
        path = href.split("://", 1)[-1].split("/", 1)[-1] if href else ""
        if not path:
            path = "/"
        else:
            path = "/" + path
        if len(path) > 47:
            path = path[:47] + "..."
        rows.append({
            "fs_idx": fs_idx,
            "ts_rel": fs["timestamp"] - base_ts,
            "cid": fs.get("checkoutId"),
            "elements": elements,
            "class": cls,
            "href": href,
        })
        table.add_row(
            str(fs_idx),
            f"+{fs['timestamp'] - base_ts}ms",
            str(fs.get("checkoutId", "-")),
            str(elements),
            cls,
            path,
        )
        prev_elements = elements
    console.print(table)
    console.print(f"\n  Total FullSnapshots: [bold]{len(fs_events)}[/bold]")

    # --- Section 2: Trigger classification ---
    console.print()
    console.print(Panel(Text("2. TRIGGER ANALYSIS", style="bold cyan"), expand=False))
    trigger_table = Table(show_header=True)
    trigger_table.add_column("FS#", justify="right", style="dim")
    trigger_table.add_column("Class", style="yellow")
    trigger_table.add_column("Vis-muts", justify="right", style="cyan")
    trigger_table.add_column("Preceding sources (last 8 events)")

    for row in rows:
        trig = find_trigger(events, row["fs_idx"])
        trigger_table.add_row(
            str(row["fs_idx"]),
            row["class"],
            str(trig["visibility_mutations"]),
            ", ".join(trig["sources"]) or "(start of session)",
        )
    console.print(trigger_table)

    # --- Section 3: Same-URL coalescing ---
    console.print()
    console.print(Panel(Text("3. SAME-URL COALESCING POTENTIAL", style="bold cyan"), expand=False))
    coalesce_pairs: list[tuple[dict, dict]] = []
    for i in range(1, len(rows)):
        prev = rows[i - 1]
        cur = rows[i]
        if prev["href"] == cur["href"] and prev["href"]:
            gap = cur["ts_rel"] - prev["ts_rel"]
            coalesce_pairs.append((prev, cur))
            console.print(
                f"  FS#{prev['fs_idx']} ({prev['elements']} el) → "
                f"FS#{cur['fs_idx']} ({cur['elements']} el) — "
                f"same URL, gap [bold]{gap}ms[/bold] — class: {cur['class']}"
            )

    if not coalesce_pairs:
        console.print("  [green]No same-URL re-snapshots found[/green]")
    else:
        console.print()
        console.print(
            f"  [yellow]{len(coalesce_pairs)} same-URL re-snapshot(s) could be coalesced[/yellow]"
        )

    # --- Section 4: Loading-state ---
    console.print()
    console.print(Panel(Text("4. LOADING-STATE HEURISTIC", style="bold cyan"), expand=False))
    loading_snaps = [r for r in rows if r["class"] == "loading"]
    if loading_snaps:
        for r in loading_snaps:
            console.print(
                f"  FS#{r['fs_idx']} +{r['ts_rel']}ms — only [bold red]{r['elements']}[/bold red] "
                f"elements (likely skeleton/transition state)"
            )
        console.print()
        console.print(
            f"  [yellow]{len(loading_snaps)} loading-state snapshot(s) — "
            f"these capture transitional UI without real content[/yellow]"
        )
    else:
        console.print("  [green]No loading-state snapshots detected[/green]")

    # --- Section 5: Recommendation ---
    console.print()
    console.print(Panel(Text("5. RECOMMENDATION", style="bold cyan"), expand=False))
    redundant = len(coalesce_pairs) + len(loading_snaps)
    useful = len(rows) - redundant
    console.print(f"  Useful snapshots:   [green]{useful}[/green]")
    console.print(f"  Redundant snapshots: [red]{redundant}[/red] "
                  f"(loading={len(loading_snaps)}, same-URL={len(coalesce_pairs)})")
    console.print()

    if redundant > 0:
        console.print("  [bold]Suggested config tweaks (in RRWebRecorder.ts default options):[/bold]")
        console.print("""
    sampling: {
      ...,
      navigation: {
        debounce: 300,        // was 100 — coalesce URL-bouncing during SPA hydration
        settleTimeout: 800,   // was 150 — wait longer for data-load mutations to settle
        maxWait: 5000,        // unchanged — hard cap
      },
    }
""")
        console.print("  [dim]Plus consider adding NavigationManager same-URL guard:[/dim]")
        console.print(
            "  [dim]  if (data.href === lastSnapshotHref && (now - lastSnapshotAt) < 2000) skip[/dim]"
        )

    return 0 if redundant == 0 else 0  # informational, not pass/fail


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", "-f", type=Path, default=DEFAULT_FILE)
    args = parser.parse_args()

    if not args.file.exists():
        console.print(f"[red]File not found: {args.file}[/red]")
        sys.exit(1)

    console.print(Panel(Text(f"LOGIN SNAPSHOT ANALYSIS\n{args.file.name}", style="bold cyan")))
    sys.exit(analyze(args.file))


if __name__ == "__main__":
    main()
