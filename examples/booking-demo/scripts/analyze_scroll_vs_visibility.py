"""Analyze the interaction between scroll events and visibility mutations.

Diagnoses whether the scroll-settle suppression (from commit e7f26bb) is
incorrectly silencing legitimate visibility-based checkouts.

Shows:
  1. Timeline of Scroll, Click, Visibility events
  2. Which notifyActivity calls would be suppressed by scroll settle window
  3. Simulated visibilityMutationCount with and without suppression
  4. Where FullSnapshots SHOULD have been triggered

Usage:
    python scripts/analyze_scroll_vs_visibility.py [--file PATH] [--settle MS]
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# rrweb enum values
REPORT_DIR = Path(__file__).resolve().parent.parent / "test-results" / "cypress" / "ui"
DEFAULT_FILE = (
    REPORT_DIR
    / "full-booking-flow.spec.cy.ts"
    / "chrome"
    / "Book-Deluxe-Sea-View-Suite-completes-the-full-booking-flow.json"
)

ET_FULL_SNAPSHOT = 2
ET_INCREMENTAL = 3
ET_META = 4

IS_MUTATION = 0
IS_MOUSE_INTERACTION = 2
IS_SCROLL = 3
IS_INPUT = 5
IS_VISIBILITY = 17

SOURCE_NAMES = {
    0: "Mutation", 1: "MouseMove", 2: "MouseInteraction", 3: "Scroll",
    4: "ViewportResize", 5: "Input", 6: "TouchMove", 7: "MediaInteraction",
    8: "StyleSheetRule", 9: "CanvasMutation", 10: "Font", 11: "Log",
    12: "Drag", 13: "StyleDeclaration", 14: "Selection",
    15: "AdoptedStyleSheet", 16: "CustomElement", 17: "Visibility",
}

MOUSE_NAMES = {
    0: "MouseUp", 1: "MouseDown", 2: "Click", 3: "ContextMenu",
    4: "DblClick", 5: "Focus", 6: "Blur", 7: "TouchStart",
    8: "TouchMove", 9: "TouchEnd", 10: "TouchCancel",
}

console = Console()


def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def fmt_rel(ts: int, base: int) -> str:
    return f"+{ts - base}ms"


def fmt_delta(delta: int) -> str:
    if delta < 0:
        return f"{delta}ms"
    return f"+{delta}ms"


def count_visibility_items(data: dict) -> int:
    """Count visibility mutation items in a Visibility event's data."""
    items = data.get("items", [])
    return len(items) if items else 0


def collect_text_from_node(node: dict, depth: int = 0) -> list[str]:
    texts = []
    if not isinstance(node, dict):
        return texts
    if node.get("type") == 3:
        text = node.get("textContent", "").strip()
        if text:
            texts.append(text)
    if depth < 10:
        for child in node.get("childNodes", []) or []:
            texts.extend(collect_text_from_node(child, depth + 1))
    return texts


def find_node_by_id(node: dict, target_id: int, depth: int = 0) -> dict | None:
    if not isinstance(node, dict):
        return None
    if node.get("id") == target_id:
        return node
    if depth < 100:
        for child in node.get("childNodes", []) or []:
            found = find_node_by_id(child, target_id, depth + 1)
            if found:
                return found
    return None


def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", "-f", type=Path, default=DEFAULT_FILE)
    parser.add_argument(
        "--settle", type=int, default=200,
        help="Scroll settle time in ms (default: 200, matching (sampling.scroll||100)*2)",
    )
    parser.add_argument(
        "--nvm", type=int, default=60,
        help="checkoutEveryNvm threshold (default: 60)",
    )
    args = parser.parse_args()

    print_header("SCROLL vs VISIBILITY SUPPRESSION ANALYSIS")
    console.print(f"[bold]File:[/bold] {args.file}")
    console.print(f"[bold]Scroll settle window:[/bold] {args.settle}ms")
    console.print(f"[bold]checkoutEveryNvm:[/bold] {args.nvm}")

    if not args.file.exists():
        console.print(f"[bold red]File not found:[/bold red] {args.file}")
        sys.exit(1)

    with open(args.file, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    if not events:
        console.print("[bold red]No events[/bold red]")
        sys.exit(1)

    base_ts = events[0]["timestamp"]
    console.print(f"[dim]Events: {len(events)}[/dim]")

    # =========================================================================
    # 1. Extract relevant events
    # =========================================================================
    timeline: list[dict[str, Any]] = []
    full_snapshots: list[dict] = []

    for i, ev in enumerate(events):
        ts = ev.get("timestamp", 0)
        cid = ev.get("checkoutId")
        etype = ev.get("type")

        if etype == ET_META:
            href = ev.get("data", {}).get("href", "")
            timeline.append({
                "idx": i, "ts": ts, "cid": cid,
                "kind": "META", "detail": href[-40:],
            })

        elif etype == ET_FULL_SNAPSHOT:
            fs_node = ev.get("data", {}).get("node")
            full_snapshots.append({"idx": i, "ts": ts, "cid": cid, "node": fs_node})
            timeline.append({
                "idx": i, "ts": ts, "cid": cid,
                "kind": "FullSnapshot", "detail": "",
            })

        elif etype == ET_INCREMENTAL:
            src = ev.get("data", {}).get("source")

            if src == IS_SCROLL:
                nid = ev.get("data", {}).get("id")
                timeline.append({
                    "idx": i, "ts": ts, "cid": cid,
                    "kind": "Scroll", "detail": f"node={nid}",
                })

            elif src == IS_MOUSE_INTERACTION:
                mtype = ev.get("data", {}).get("type", -1)
                if mtype == 2:  # Click
                    nid = ev.get("data", {}).get("id")
                    # Try to resolve element text from nearest FullSnapshot
                    text = ""
                    for fs in reversed(full_snapshots):
                        if fs["idx"] <= i and fs["node"]:
                            node = find_node_by_id(fs["node"], nid)
                            if node:
                                texts = collect_text_from_node(node)
                                text = " ".join(texts)[:30]
                                break
                    # Also check mutations
                    if not text:
                        for j in range(i):
                            ej = events[j]
                            if ej.get("type") == ET_INCREMENTAL:
                                d = ej.get("data", {})
                                if d.get("source") == IS_MUTATION:
                                    for add in d.get("adds", []) or []:
                                        nd = add.get("node", {})
                                        if nd.get("id") == nid:
                                            texts = collect_text_from_node(nd)
                                            text = " ".join(texts)[:30]
                    timeline.append({
                        "idx": i, "ts": ts, "cid": cid,
                        "kind": "Click", "detail": f"node={nid} {text}",
                    })

                elif mtype in (5, 6):  # Focus/Blur
                    pass  # skip noise

            elif src == IS_VISIBILITY:
                count = count_visibility_items(ev.get("data", {}))
                timeline.append({
                    "idx": i, "ts": ts, "cid": cid,
                    "kind": "Visibility", "detail": f"items={count}",
                    "vis_count": count,
                })

            elif src == IS_MUTATION:
                adds = ev.get("data", {}).get("adds", [])
                removes = ev.get("data", {}).get("removes", [])
                n_adds = len(adds) if adds else 0
                n_removes = len(removes) if removes else 0
                if n_adds > 5 or n_removes > 5:
                    timeline.append({
                        "idx": i, "ts": ts, "cid": cid,
                        "kind": "Mutation",
                        "detail": f"adds={n_adds} removes={n_removes}",
                    })

    # =========================================================================
    # 2. Print event timeline
    # =========================================================================
    print_header("EVENT TIMELINE (Scroll, Click, Visibility, FullSnapshot, big Mutation)")

    table = Table(show_header=True, show_lines=False)
    table.add_column("Evt#", style="dim", justify="right", width=4)
    table.add_column("CID", style="dim", justify="right", width=3)
    table.add_column("Rel", width=10)
    table.add_column("Kind", width=14)
    table.add_column("Detail", max_width=50)

    for entry in timeline:
        kind = entry["kind"]
        style = ""
        if kind == "FullSnapshot":
            style = "bold magenta"
        elif kind == "META":
            style = "bold blue"
        elif kind == "Scroll":
            style = "yellow"
        elif kind == "Click":
            style = "bold green"
        elif kind == "Visibility":
            style = "cyan"
        elif kind == "Mutation":
            style = "dim"

        table.add_row(
            str(entry["idx"]),
            str(entry["cid"]),
            fmt_rel(entry["ts"], base_ts),
            Text(kind, style=style),
            entry["detail"],
        )

    console.print(table)

    # =========================================================================
    # 3. Simulate scroll-suppression effect
    # =========================================================================
    print_header("SCROLL SETTLE SUPPRESSION SIMULATION")

    console.print(f"  Simulating with settle_time={args.settle}ms, checkoutEveryNvm={args.nvm}")
    console.print()

    # Track scroll timestamps and visibility events
    last_scroll_ts = 0
    vis_count_with_suppression = 0
    vis_count_without_suppression = 0
    suppressed_events: list[dict] = []
    passed_events: list[dict] = []
    checkouts_with: list[dict] = []
    checkouts_without: list[dict] = []

    for entry in timeline:
        ts = entry["ts"]

        if entry["kind"] == "FullSnapshot":
            # Reset counts on actual full snapshot
            vis_count_with_suppression = 0
            vis_count_without_suppression = 0
            continue

        if entry["kind"] == "Scroll":
            last_scroll_ts = ts
            continue

        if entry["kind"] == "Visibility":
            vis_items = entry.get("vis_count", 0)
            if vis_items == 0:
                continue

            delta_from_scroll = ts - last_scroll_ts if last_scroll_ts > 0 else 999999
            suppressed = delta_from_scroll < args.settle

            # WITHOUT suppression (original behavior)
            vis_count_without_suppression += vis_items
            if vis_count_without_suppression >= args.nvm:
                checkouts_without.append({
                    "ts": ts, "idx": entry["idx"], "cid": entry["cid"],
                    "trigger_count": vis_count_without_suppression,
                })
                vis_count_without_suppression = 0

            # WITH suppression (new behavior)
            if suppressed:
                suppressed_events.append({
                    "idx": entry["idx"], "ts": ts, "cid": entry["cid"],
                    "vis_items": vis_items,
                    "delta_scroll": delta_from_scroll,
                })
            else:
                vis_count_with_suppression += vis_items
                passed_events.append({
                    "idx": entry["idx"], "ts": ts, "cid": entry["cid"],
                    "vis_items": vis_items,
                    "delta_scroll": delta_from_scroll,
                    "running_total": vis_count_with_suppression,
                })
                if vis_count_with_suppression >= args.nvm:
                    checkouts_with.append({
                        "ts": ts, "idx": entry["idx"], "cid": entry["cid"],
                        "trigger_count": vis_count_with_suppression,
                    })
                    vis_count_with_suppression = 0

    # Print suppressed events
    if suppressed_events:
        console.print(f"  [bold red]SUPPRESSED visibility events ({len(suppressed_events)}):[/bold red]")
        sup_table = Table(show_header=True, show_lines=False)
        sup_table.add_column("Evt#", justify="right", width=4)
        sup_table.add_column("CID", justify="right", width=3)
        sup_table.add_column("Rel", width=10)
        sup_table.add_column("Items", justify="right", width=6)
        sup_table.add_column("Since Scroll", width=12)
        sup_table.add_column("Status", width=20)

        for ev in suppressed_events:
            sup_table.add_row(
                str(ev["idx"]),
                str(ev["cid"]),
                fmt_rel(ev["ts"], base_ts),
                str(ev["vis_items"]),
                f"{ev['delta_scroll']}ms",
                Text("SUPPRESSED", style="bold red"),
            )
        console.print(sup_table)
    else:
        console.print("  [green]No visibility events were suppressed[/green]")

    # Print passed events
    if passed_events:
        console.print()
        console.print(f"  [bold green]PASSED visibility events ({len(passed_events)}):[/bold green]")
        pass_table = Table(show_header=True, show_lines=False)
        pass_table.add_column("Evt#", justify="right", width=4)
        pass_table.add_column("CID", justify="right", width=3)
        pass_table.add_column("Rel", width=10)
        pass_table.add_column("Items", justify="right", width=6)
        pass_table.add_column("Since Scroll", width=12)
        pass_table.add_column("Running Total", justify="right", width=13)

        for ev in passed_events:
            pass_table.add_row(
                str(ev["idx"]),
                str(ev["cid"]),
                fmt_rel(ev["ts"], base_ts),
                str(ev["vis_items"]),
                f"{ev['delta_scroll']}ms",
                str(ev["running_total"]),
            )
        console.print(pass_table)

    # =========================================================================
    # 4. Checkout comparison
    # =========================================================================
    print_header("CHECKOUT COMPARISON")

    # Actual checkouts in the data
    actual_checkouts = [
        {"idx": fs["idx"], "ts": fs["ts"], "cid": fs["cid"]}
        for fs in full_snapshots
    ]

    console.print(f"  [bold]Actual FullSnapshots in data:[/bold] {len(actual_checkouts)}")
    for co in actual_checkouts:
        console.print(f"    event[{co['idx']}] {fmt_rel(co['ts'], base_ts)} cid={co['cid']}")

    console.print()
    console.print(f"  [bold]Visibility-triggered checkouts WITHOUT suppression:[/bold] {len(checkouts_without)}")
    for co in checkouts_without:
        console.print(
            f"    event[{co['idx']}] {fmt_rel(co['ts'], base_ts)} cid={co['cid']} "
            f"(after {co['trigger_count']} visibility items)"
        )

    console.print()
    console.print(f"  [bold]Visibility-triggered checkouts WITH suppression:[/bold] {len(checkouts_with)}")
    for co in checkouts_with:
        console.print(
            f"    event[{co['idx']}] {fmt_rel(co['ts'], base_ts)} cid={co['cid']} "
            f"(after {co['trigger_count']} visibility items)"
        )

    # =========================================================================
    # 5. Scroll → Click → Visibility correlation
    # =========================================================================
    print_header("SCROLL → CLICK → VISIBILITY CORRELATION")
    console.print("  Shows scroll→click pairs where visibility mutations follow within settle window")
    console.print()

    # Find scroll→click pairs
    for i, entry in enumerate(timeline):
        if entry["kind"] != "Click":
            continue

        click_ts = entry["ts"]

        # Find preceding scroll (within 500ms)
        preceding_scroll = None
        for j in range(i - 1, -1, -1):
            if timeline[j]["kind"] == "Scroll" and click_ts - timeline[j]["ts"] < 500:
                preceding_scroll = timeline[j]
                break
            if click_ts - timeline[j]["ts"] > 500:
                break

        # Find following visibility events (within settle window from the scroll)
        following_vis: list[dict] = []
        if preceding_scroll:
            scroll_ts = preceding_scroll["ts"]
            for j in range(i + 1, len(timeline)):
                if timeline[j]["ts"] - scroll_ts > args.settle * 2:
                    break
                if timeline[j]["kind"] == "Visibility":
                    delta = timeline[j]["ts"] - scroll_ts
                    following_vis.append({
                        **timeline[j],
                        "delta_from_scroll": delta,
                        "would_suppress": delta < args.settle,
                    })

        if preceding_scroll and following_vis:
            total_vis_items = sum(v.get("vis_count", 0) for v in following_vis)
            suppressed_items = sum(
                v.get("vis_count", 0) for v in following_vis if v["would_suppress"]
            )
            console.print(
                f"  [bold green]Click[/bold green] event[{entry['idx']}] "
                f"{fmt_rel(click_ts, base_ts)} — {entry['detail']}"
            )
            console.print(
                f"    Scroll at {fmt_rel(preceding_scroll['ts'], base_ts)} "
                f"({click_ts - preceding_scroll['ts']}ms before click)"
            )
            console.print(
                f"    Visibility events after: {len(following_vis)} "
                f"(total items={total_vis_items}, suppressed={suppressed_items})"
            )
            for v in following_vis:
                status = "[red]SUPPRESSED[/red]" if v["would_suppress"] else "[green]PASSED[/green]"
                console.print(
                    f"      event[{v['idx']}] {fmt_delta(v['delta_from_scroll'])}ms "
                    f"from scroll, items={v.get('vis_count', 0)} → {status}"
                )
            console.print()

    # =========================================================================
    # 6. Diagnosis
    # =========================================================================
    print_header("DIAGNOSIS")

    total_suppressed_items = sum(ev["vis_items"] for ev in suppressed_events)
    total_passed_items = sum(ev["vis_items"] for ev in passed_events)

    console.print(f"  Total visibility items emitted: {total_suppressed_items + total_passed_items}")
    console.print(f"  Items suppressed from counting: {total_suppressed_items} ({total_suppressed_items / max(1, total_suppressed_items + total_passed_items) * 100:.0f}%)")
    console.print(f"  Items counted: {total_passed_items}")
    console.print()

    lost_checkouts = len(checkouts_without) - len(checkouts_with)
    if lost_checkouts > 0:
        console.print(
            f"  [bold red]PROBLEM: {lost_checkouts} visibility-triggered checkout(s) "
            f"lost due to scroll suppression[/bold red]"
        )
        console.print()
        console.print("  [bold]Root cause:[/bold]")
        console.print("    The pattern 'scroll → click → UI change → visibility mutations'")
        console.print("    causes legitimate visibility mutations to fall within the scroll")
        console.print(f"    settle window ({args.settle}ms), suppressing checkout counting.")
        console.print()
        console.print("  [bold]Affected flow steps:[/bold]")
        console.print("    - 'Continue' click → step change (Guest Info)")
        console.print("    - 'Review & Confirm' click → step change (Review)")
        console.print("    - 'Confirm Booking' click → form rerender (Confirmation)")
    else:
        console.print("  [green]No checkouts lost from suppression[/green]")

    # =========================================================================
    # 7. Scroll coverage analysis — what % of the session is "settle window"
    # =========================================================================
    print_header("SCROLL SETTLE WINDOW COVERAGE")

    # Analyze per-session
    sessions: list[dict] = []
    current_cid = None
    current_events: list[dict] = []
    for entry in timeline:
        if entry["cid"] != current_cid:
            if current_events:
                sessions.append({"cid": current_cid, "events": current_events})
            current_cid = entry["cid"]
            current_events = [entry]
        else:
            current_events.append(entry)
    if current_events:
        sessions.append({"cid": current_cid, "events": current_events})

    for session in sessions:
        cid = session["cid"]
        sevents = session["events"]
        if not sevents:
            continue

        session_start = sevents[0]["ts"]
        session_end = sevents[-1]["ts"]
        session_duration = session_end - session_start

        if session_duration == 0:
            continue

        console.print(f"\n  [bold]Session CID={cid}[/bold] ({session_duration}ms)")

        scroll_events = [e for e in sevents if e["kind"] == "Scroll"]
        if not scroll_events:
            console.print("    No scroll events")
            continue

        console.print(f"    Scroll events: {len(scroll_events)}")

        # Calculate what % of session duration is covered by settle windows
        # Each scroll creates a settle window of [scroll_ts, scroll_ts + settle_time]
        # Merge overlapping windows
        windows: list[tuple[int, int]] = []
        for sc in scroll_events:
            start = sc["ts"]
            end = start + args.settle
            if windows and start <= windows[-1][1]:
                windows[-1] = (windows[-1][0], max(windows[-1][1], end))
            else:
                windows.append((start, end))

        total_covered = sum(min(w[1], session_end) - w[0] for w in windows)
        coverage_pct = total_covered / session_duration * 100 if session_duration else 0

        console.print(f"    Merged settle windows: {len(windows)}")
        console.print(f"    Total covered time: {total_covered}ms / {session_duration}ms")
        console.print(
            f"    [bold {'red' if coverage_pct > 80 else 'yellow' if coverage_pct > 50 else 'green'}]"
            f"Coverage: {coverage_pct:.1f}%[/bold {'red' if coverage_pct > 80 else 'yellow' if coverage_pct > 50 else 'green'}]"
        )

        if coverage_pct > 80:
            console.print(
                f"    [red]=> notifyActivity suppressed for {coverage_pct:.0f}% of session![/red]"
            )
            console.print(
                f"    [red]=> Visibility-based checkouts CANNOT trigger[/red]"
            )

        # Show the gaps where notifyActivity COULD work
        gaps: list[tuple[int, int]] = []
        prev_end = session_start
        for w in windows:
            if w[0] > prev_end:
                gaps.append((prev_end, w[0]))
            prev_end = max(prev_end, w[1])
        if prev_end < session_end:
            gaps.append((prev_end, session_end))

        if gaps:
            console.print(f"\n    Gaps where notifyActivity COULD count:")
            for g in gaps:
                gap_rel_start = fmt_rel(g[0], base_ts)
                gap_rel_end = fmt_rel(g[1], base_ts)
                gap_dur = g[1] - g[0]
                # How many RAF ticks fit in this gap? (100ms each)
                raf_ticks = gap_dur // 100
                console.print(
                    f"      {gap_rel_start} → {gap_rel_end} ({gap_dur}ms, ~{raf_ticks} RAF ticks)"
                )
        else:
            console.print(f"\n    [red]NO gaps — settle window covers entire session[/red]")

    sys.exit(1 if lost_checkouts > 0 else 0)


if __name__ == "__main__":
    main()
