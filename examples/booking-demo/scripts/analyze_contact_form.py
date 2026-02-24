"""Analyze the contact form test report for missing FullSnapshots.

Investigates why the seaside-contact-form test produces only 1 FullSnapshot
instead of the expected 2 (home page + contact page). Prints:
  - Complete event timeline with types and sources
  - Click event analysis (timestamps, targets, time until next FullSnapshot)
  - Mutation density per 100ms window around clicks
  - Timing gap between "Contact" click and recording end
  - META href progression validation
  - DOM content of each FullSnapshot

Usage:
    python scripts/analyze_contact_form.py [--file PATH]
"""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# =============================================================================
# Constants — rrweb enum values
# =============================================================================

REPORT_DIR = Path(__file__).resolve().parent.parent / "test-results" / "cypress" / "ui"
DEFAULT_FILE = (
    REPORT_DIR
    / "seaside-contact-form.spec.cy.ts"
    / "chrome"
    / "Modern-Seaside-Stay-Contact-form-fills-and-submits-the-contact-form.json"
)


class EventType:
    DOM_CONTENT_LOADED = 0
    LOAD = 1
    FULL_SNAPSHOT = 2
    INCREMENTAL_SNAPSHOT = 3
    META = 4
    CUSTOM = 5
    PLUGIN = 6


EVENT_TYPE_NAMES = {
    0: "DomContentLoaded",
    1: "Load",
    2: "FullSnapshot",
    3: "IncrementalSnapshot",
    4: "Meta",
    5: "Custom",
    6: "Plugin",
}


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
    0: "Mutation", 1: "MouseMove", 2: "MouseInteraction", 3: "Scroll",
    4: "ViewportResize", 5: "Input", 6: "TouchMove", 7: "MediaInteraction",
    8: "StyleSheetRule", 9: "CanvasMutation", 10: "Font", 11: "Log",
    12: "Drag", 13: "StyleDeclaration", 14: "Selection",
    15: "AdoptedStyleSheet", 16: "CustomElement", 17: "Visibility",
}

# MouseInteractions enum values
MOUSE_INTERACTION_NAMES = {
    0: "MouseUp", 1: "MouseDown", 2: "Click", 3: "ContextMenu",
    4: "DblClick", 5: "Focus", 6: "Blur", 7: "TouchStart",
    8: "TouchMove_Departed", 9: "TouchEnd", 10: "TouchCancel",
}

console = Console()


# =============================================================================
# Helpers
# =============================================================================

def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def fmt_relative(ts: int, base: int) -> str:
    delta = ts - base
    return f"+{delta}ms"


def collect_text_from_node(node: dict[str, Any], depth: int = 0) -> list[str]:
    """Recursively collect text content from a serialized DOM node."""
    texts: list[str] = []
    if not isinstance(node, dict):
        return texts

    if node.get("type") == 3:
        text = node.get("textContent", "").strip()
        if text:
            texts.append(text)

    attrs = node.get("attributes", {})
    if isinstance(attrs, dict):
        for attr_name in ("placeholder", "value", "aria-label", "alt", "title"):
            val = attrs.get(attr_name, "")
            if val and isinstance(val, str) and val.strip():
                texts.append(val.strip())

    if depth < 20:
        for child in node.get("childNodes", []) or []:
            texts.extend(collect_text_from_node(child, depth + 1))

    return texts


# =============================================================================
# Session grouping
# =============================================================================

def group_events_by_sessions(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    has_checkout_id = any("checkoutId" in e for e in events)
    if has_checkout_id:
        return _group_by_checkout_id(events)
    return _group_by_meta_snapshot(events)


def _group_by_checkout_id(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for event in events:
        cid = event.get("checkoutId")
        if current is None or cid != current["checkout_id"]:
            if current is not None:
                sessions.append(current)
            current = {
                "index": len(sessions),
                "checkout_id": cid,
                "events": [event],
            }
        else:
            current["events"].append(event)

    if current is not None:
        sessions.append(current)
    return sessions


def _group_by_meta_snapshot(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    current_events: list[dict[str, Any]] = []

    for event in events:
        etype = event.get("type")
        if etype == EventType.META:
            if current_events:
                sessions.append({
                    "index": len(sessions),
                    "checkout_id": None,
                    "events": current_events,
                })
            current_events = [event]
        else:
            current_events.append(event)

    if current_events:
        sessions.append({
            "index": len(sessions),
            "checkout_id": None,
            "events": current_events,
        })
    return sessions


# =============================================================================
# Validation
# =============================================================================

class ValidationResult:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.warnings: list[str] = []
        self.failures: list[str] = []

    @property
    def ok(self) -> bool:
        return len(self.failures) == 0

    def add_pass(self, msg: str) -> None:
        self.passed.append(msg)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def add_failure(self, msg: str) -> None:
        self.failures.append(msg)


# =============================================================================
# Analysis functions
# =============================================================================

def find_click_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all MouseInteraction Click events."""
    clicks = []
    for i, event in enumerate(events):
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MOUSE_INTERACTION:
            continue
        interaction_type = data.get("type")
        if interaction_type == 2:  # Click
            clicks.append({
                "event_index": i,
                "timestamp": event.get("timestamp", 0),
                "target_id": data.get("id"),
                "x": data.get("x"),
                "y": data.get("y"),
                "selector": data.get("selector", ""),
            })
    return clicks


def find_full_snapshots(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all FullSnapshot events with their indices."""
    snapshots = []
    for i, event in enumerate(events):
        if event.get("type") == EventType.FULL_SNAPSHOT:
            node = event.get("data", {}).get("node")
            texts = collect_text_from_node(node) if node else []
            snapshots.append({
                "event_index": i,
                "timestamp": event.get("timestamp", 0),
                "text_sample": texts[:30],
            })
    return snapshots


def find_meta_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all META events."""
    metas = []
    for i, event in enumerate(events):
        if event.get("type") == EventType.META:
            data = event.get("data", {})
            metas.append({
                "event_index": i,
                "timestamp": event.get("timestamp", 0),
                "href": data.get("href", ""),
                "width": data.get("width"),
                "height": data.get("height"),
            })
    return metas


def find_input_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all Input events (typing)."""
    inputs = []
    for i, event in enumerate(events):
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.INPUT:
            continue
        inputs.append({
            "event_index": i,
            "timestamp": event.get("timestamp", 0),
            "target_id": data.get("id"),
            "text": data.get("text", "")[:50],
        })
    return inputs


def compute_mutation_density(
    events: list[dict[str, Any]],
    center_ts: int,
    window_ms: int = 500,
    bucket_ms: int = 100,
) -> list[tuple[int, int]]:
    """Count mutations per bucket_ms window around center_ts.

    Returns list of (bucket_start_offset, count) tuples.
    """
    start = center_ts - window_ms
    end = center_ts + window_ms
    n_buckets = (2 * window_ms) // bucket_ms

    buckets: list[int] = [0] * n_buckets

    for event in events:
        ts = event.get("timestamp", 0)
        if ts < start or ts >= end:
            continue
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        bucket_idx = (ts - start) // bucket_ms
        if 0 <= bucket_idx < n_buckets:
            buckets[bucket_idx] += 1

    result = []
    for i, count in enumerate(buckets):
        offset = (i * bucket_ms) - window_ms
        result.append((offset, count))
    return result


def analyze_click_to_snapshot_gaps(
    clicks: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """For each click, find the time to the next FullSnapshot (if any)."""
    results = []
    for click in clicks:
        click_ts = click["timestamp"]
        next_snap = None
        for snap in snapshots:
            if snap["timestamp"] > click_ts:
                next_snap = snap
                break
        gap = (next_snap["timestamp"] - click_ts) if next_snap else None
        results.append({
            **click,
            "next_snapshot_ts": next_snap["timestamp"] if next_snap else None,
            "gap_to_next_snapshot_ms": gap,
        })
    return results


# =============================================================================
# Printing
# =============================================================================

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_event_timeline(events: list[dict[str, Any]], base_ts: int) -> None:
    """Print a condensed event timeline."""
    print_header("EVENT TIMELINE")

    table = Table(show_header=True, show_lines=False, pad_edge=False)
    table.add_column("#", style="dim", justify="right", width=5)
    table.add_column("Time", style="dim", width=14)
    table.add_column("Rel", style="dim", width=9)
    table.add_column("Type", style="cyan", width=20)
    table.add_column("Source/Details", style="yellow", max_width=60)

    for i, event in enumerate(events):
        ts = event.get("timestamp", 0)
        etype = event.get("type")
        type_name = EVENT_TYPE_NAMES.get(etype, str(etype))
        data = event.get("data", {}) if isinstance(event.get("data"), dict) else {}

        detail = ""
        style = None

        if etype == EventType.META:
            detail = data.get("href", "")
            style = "bold magenta"
        elif etype == EventType.FULL_SNAPSHOT:
            detail = "(full DOM snapshot)"
            style = "bold green"
        elif etype == EventType.INCREMENTAL_SNAPSHOT:
            src = data.get("source")
            src_name = SOURCE_NAMES.get(src, str(src)) if src is not None else ""
            if src == IncrementalSource.MOUSE_INTERACTION:
                mi_type = data.get("type")
                mi_name = MOUSE_INTERACTION_NAMES.get(mi_type, str(mi_type))
                selector = data.get("selector", "")
                detail = f"{src_name}.{mi_name}"
                if selector:
                    detail += f" [{selector[:40]}]"
            elif src == IncrementalSource.INPUT:
                text = data.get("text", "")[:20]
                detail = f"{src_name} text='{text}'"
            elif src == IncrementalSource.MUTATION:
                adds = len(data.get("adds", []) or [])
                removes = len(data.get("removes", []) or [])
                attrs = len(data.get("attributes", []) or [])
                texts = len(data.get("texts", []) or [])
                parts = []
                if adds: parts.append(f"+{adds}")
                if removes: parts.append(f"-{removes}")
                if attrs: parts.append(f"a{attrs}")
                if texts: parts.append(f"t{texts}")
                detail = f"{src_name} [{','.join(parts)}]" if parts else src_name
            else:
                detail = src_name
        elif etype == EventType.CUSTOM:
            tag = data.get("tag", "")
            detail = f"tag={tag}"

        row_style = style or ""
        table.add_row(
            str(i),
            fmt_ts(ts),
            fmt_relative(ts, base_ts),
            type_name,
            detail,
            style=row_style,
        )

    console.print(table)


def print_click_analysis(
    clicks_with_gaps: list[dict[str, Any]],
    events: list[dict[str, Any]],
    base_ts: int,
) -> None:
    print_header("CLICK EVENT ANALYSIS")

    if not clicks_with_gaps:
        console.print("  [dim]No click events found[/dim]")
        return

    for click in clicks_with_gaps:
        ts = click["timestamp"]
        gap = click["gap_to_next_snapshot_ms"]
        selector = click.get("selector", "")

        console.print(
            f"\n  [bold]Click[/bold] at {fmt_ts(ts)} ({fmt_relative(ts, base_ts)})"
        )
        console.print(f"    target_id={click['target_id']}  selector={selector}")
        if gap is not None:
            console.print(f"    [green]Next FullSnapshot: {gap}ms later[/green]")
        else:
            console.print(f"    [red]No FullSnapshot after this click![/red]")

        # Mutation density around this click
        density = compute_mutation_density(events, ts)
        non_zero = [(offset, count) for offset, count in density if count > 0]
        if non_zero:
            console.print(f"    Mutation density (100ms buckets around click):")
            for offset, count in density:
                bar = "#" * min(count, 40)
                if count > 0:
                    console.print(f"      {offset:+5d}ms: {count:3d} {bar}")


def print_input_analysis(
    inputs: list[dict[str, Any]],
    clicks: list[dict[str, Any]],
    base_ts: int,
    recording_end_ts: int,
) -> None:
    print_header("INPUT (TYPING) ANALYSIS")

    if not inputs:
        console.print("  [dim]No input events found[/dim]")
        return

    console.print(f"  Total input events: {len(inputs)}")
    if inputs:
        first_input = inputs[0]["timestamp"]
        last_input = inputs[-1]["timestamp"]
        console.print(
            f"  First input: {fmt_ts(first_input)} ({fmt_relative(first_input, base_ts)})"
        )
        console.print(
            f"  Last input:  {fmt_ts(last_input)} ({fmt_relative(last_input, base_ts)})"
        )
        console.print(f"  Input span:  {last_input - first_input}ms")

    # Time from last click (Contact nav click) to first input
    if clicks and inputs:
        # Find the click that is likely the Contact navigation click
        contact_click = None
        for c in clicks:
            sel = c.get("selector", "").lower()
            if "contact" in sel or not contact_click:
                contact_click = c

        if contact_click:
            gap = inputs[0]["timestamp"] - contact_click["timestamp"]
            console.print(
                f"\n  Time from Contact click to first input: [bold]{gap}ms[/bold]"
            )
            console.print(
                f"  NavigationManager needs: 100ms debounce + 150ms settle = 250ms minimum"
            )
            if gap < 250:
                console.print(
                    f"  [bold red]INSUFFICIENT: typing started before settle could complete![/bold red]"
                )
            elif gap < 350:
                console.print(
                    f"  [yellow]TIGHT: typing started close to settle window[/yellow]"
                )
            else:
                console.print(
                    f"  [green]OK: enough gap for settle cycle[/green]"
                )

    # Check if typing causes continuous mutations (interfering with settle)
    console.print(f"\n  Time from last input to recording end: "
                  f"{recording_end_ts - inputs[-1]['timestamp']}ms")


def print_mutation_settle_analysis(
    events: list[dict[str, Any]],
    clicks: list[dict[str, Any]],
    recording_end_ts: int,
    base_ts: int,
) -> None:
    print_header("MUTATION SETTLE INTERFERENCE ANALYSIS")

    # Find the Contact click (usually the first click on a nav element)
    contact_click = None
    for c in clicks:
        sel = c.get("selector", "").lower()
        if "contact" in sel:
            contact_click = c
            break
    if not contact_click and clicks:
        contact_click = clicks[0]

    if not contact_click:
        console.print("  [dim]No click events to analyze[/dim]")
        return

    click_ts = contact_click["timestamp"]
    console.print(f"  Contact click at: {fmt_ts(click_ts)} ({fmt_relative(click_ts, base_ts)})")
    console.print(f"  Recording ends at: {fmt_ts(recording_end_ts)} ({fmt_relative(recording_end_ts, base_ts)})")
    console.print(f"  Total time after click: {recording_end_ts - click_ts}ms")

    # NavigationManager settle cycle timeline:
    # click → +100ms debounce → start DOM settling → +150ms settle timeout → double rAF → snapshot
    # Minimum: 100 + 150 + ~32ms (2 rAF) = ~282ms
    # maxWait safety: 5000ms
    min_settle_time = 282
    max_wait_time = 5000

    time_after_click = recording_end_ts - click_ts
    console.print(f"\n  NavigationManager timing:")
    console.print(f"    Minimum settle time: ~{min_settle_time}ms (100ms debounce + 150ms settle + ~32ms rAF)")
    console.print(f"    Max wait safety timer: {max_wait_time}ms")
    console.print(f"    Available time: {time_after_click}ms")

    if time_after_click < min_settle_time:
        console.print(
            f"    [bold red]ISSUE: Recording ended before minimum settle time![/bold red]"
        )
    elif time_after_click < max_wait_time:
        console.print(
            f"    [yellow]Time is sufficient for settle but NOT for maxWait safety[/yellow]"
        )

    # Analyze mutation gaps after click — look for periods of no mutations >= 150ms
    mutations_after_click = []
    for event in events:
        ts = event.get("timestamp", 0)
        if ts <= click_ts:
            continue
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") == IncrementalSource.MUTATION:
            mutations_after_click.append(ts)

    console.print(f"\n  Mutations after click: {len(mutations_after_click)}")

    if mutations_after_click:
        # Find gaps >= 150ms (settle timeout)
        all_ts = [click_ts] + sorted(mutations_after_click)
        gaps = []
        for i in range(len(all_ts) - 1):
            gap = all_ts[i + 1] - all_ts[i]
            gaps.append((all_ts[i], all_ts[i + 1], gap))

        large_gaps = [(t1, t2, g) for t1, t2, g in gaps if g >= 150]
        if large_gaps:
            console.print(f"  [green]Found {len(large_gaps)} gap(s) >= 150ms (settle could complete):[/green]")
            for t1, t2, g in large_gaps[:5]:
                console.print(
                    f"    {fmt_relative(t1, base_ts)} → {fmt_relative(t2, base_ts)}: {g}ms gap"
                )
        else:
            max_gap = max(g for _, _, g in gaps) if gaps else 0
            console.print(
                f"  [bold red]No gap >= 150ms found after click![/bold red] "
                f"(max gap: {max_gap}ms)"
            )
            console.print(
                f"  [bold red]Continuous mutations prevent NavigationManager settle![/bold red]"
            )

        # Show mutation density after click in 100ms buckets
        console.print(f"\n  Mutation density after click (100ms buckets):")
        bucket_ms = 100
        time_span = recording_end_ts - click_ts
        n_buckets = min(int(time_span / bucket_ms) + 1, 60)
        for b in range(n_buckets):
            bucket_start = click_ts + b * bucket_ms
            bucket_end = bucket_start + bucket_ms
            count = sum(1 for ts in mutations_after_click if bucket_start <= ts < bucket_end)
            if count > 0:
                bar = "#" * min(count, 40)
                console.print(
                    f"    +{b * bucket_ms:5d}ms: {count:3d} {bar}"
                )


def print_meta_href_analysis(
    metas: list[dict[str, Any]],
    base_ts: int,
    vr: ValidationResult,
) -> None:
    print_header("META HREF PROGRESSION")

    if not metas:
        console.print("  [dim]No META events found[/dim]")
        vr.add_warning("No META events found")
        return

    for m in metas:
        console.print(
            f"  [{m['event_index']}] {fmt_ts(m['timestamp'])} "
            f"({fmt_relative(m['timestamp'], base_ts)}): {m['href']}"
        )

    hrefs = [m["href"] for m in metas]
    unique = list(dict.fromkeys(hrefs))  # preserve order, remove dupes

    if len(unique) >= 2:
        has_root = any("/" == h.rstrip("/").split("/")[-1] or h.endswith("/") for h in unique)
        has_contact = any("/contact" in h for h in unique)
        if has_contact:
            vr.add_pass(f"META href shows /contact navigation: {' -> '.join(unique)}")
        else:
            vr.add_warning(f"META hrefs don't include /contact: {unique}")
    elif len(unique) == 1:
        vr.add_failure(f"Only 1 unique META href — no navigation detected: {unique[0]}")
    else:
        vr.add_warning("No META hrefs found")


def print_snapshot_analysis(
    snapshots: list[dict[str, Any]],
    base_ts: int,
    vr: ValidationResult,
) -> None:
    print_header("FULL SNAPSHOT ANALYSIS")

    console.print(f"  Total FullSnapshots: {len(snapshots)}")

    for snap in snapshots:
        console.print(
            f"\n  [{snap['event_index']}] at {fmt_ts(snap['timestamp'])} "
            f"({fmt_relative(snap['timestamp'], base_ts)})"
        )
        texts = snap["text_sample"]
        if texts:
            # Look for route indicators
            all_text = " ".join(texts).lower()
            is_home = any(kw in all_text for kw in ["book your stay", "seaside", "suite", "room"])
            is_contact = any(kw in all_text for kw in ["contact", "send message", "phone number", "subject"])

            if is_home and not is_contact:
                console.print(f"    [cyan]Content: HOME page[/cyan]")
            elif is_contact:
                console.print(f"    [cyan]Content: CONTACT page[/cyan]")
            else:
                console.print(f"    [dim]Content: unknown page[/dim]")

            # Show first few text fragments
            sample = texts[:10]
            for t in sample:
                console.print(f"    [dim]{t[:80]}[/dim]")
            if len(texts) > 10:
                console.print(f"    [dim]... ({len(texts)} text nodes total)[/dim]")

    # Validation
    if len(snapshots) >= 2:
        vr.add_pass(f"Found {len(snapshots)} FullSnapshots (expected >= 2)")
    elif len(snapshots) == 1:
        vr.add_failure(f"Only 1 FullSnapshot found (expected >= 2 for SPA navigation)")
    else:
        vr.add_failure("No FullSnapshots found!")


def print_session_summary(sessions: list[dict[str, Any]]) -> None:
    print_header("SESSION SUMMARY")

    table = Table(show_header=True)
    table.add_column("Session", style="cyan")
    table.add_column("checkoutId", style="dim")
    table.add_column("Events", justify="right")
    table.add_column("META href", style="yellow", max_width=60)
    table.add_column("FullSnaps", justify="right", style="magenta")
    table.add_column("Duration (ms)", justify="right")

    for session in sessions:
        events = session["events"]
        cid = str(session["checkout_id"]) if session["checkout_id"] is not None else "-"

        meta_href = "-"
        fs_count = 0
        for e in events:
            if e.get("type") == EventType.META:
                meta_href = e.get("data", {}).get("href", "-")
            if e.get("type") == EventType.FULL_SNAPSHOT:
                fs_count += 1

        t0 = events[0].get("timestamp", 0) if events else 0
        t1 = events[-1].get("timestamp", 0) if events else 0
        duration = t1 - t0

        table.add_row(
            str(session["index"]),
            cid,
            str(len(events)),
            meta_href[:57] + "..." if len(meta_href) > 57 else meta_href,
            str(fs_count),
            str(duration),
        )

    console.print(table)


def print_event_type_summary(events: list[dict[str, Any]]) -> None:
    print_header("EVENT TYPE DISTRIBUTION")

    type_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()

    for event in events:
        etype = event.get("type")
        type_name = EVENT_TYPE_NAMES.get(etype, str(etype))
        type_counts[type_name] += 1

        if etype == EventType.INCREMENTAL_SNAPSHOT:
            data = event.get("data", {})
            src = data.get("source")
            src_name = SOURCE_NAMES.get(src, str(src)) if src is not None else "unknown"
            source_counts[src_name] += 1

    table = Table(show_header=True, title="Event Types")
    table.add_column("Type", style="cyan")
    table.add_column("Count", justify="right")
    for name, count in type_counts.most_common():
        table.add_row(name, str(count))
    console.print(table)

    if source_counts:
        table2 = Table(show_header=True, title="Incremental Sources")
        table2.add_column("Source", style="yellow")
        table2.add_column("Count", justify="right")
        for name, count in source_counts.most_common():
            table2.add_row(name, str(count))
        console.print(table2)


def print_timing_summary(
    events: list[dict[str, Any]],
    clicks: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    inputs: list[dict[str, Any]],
    base_ts: int,
    recording_end_ts: int,
    vr: ValidationResult,
) -> None:
    print_header("TIMING SUMMARY")

    console.print(f"  Recording start: {fmt_ts(base_ts)}")
    console.print(f"  Recording end:   {fmt_ts(recording_end_ts)}")
    console.print(f"  Total duration:  {recording_end_ts - base_ts}ms")

    if clicks:
        # Identify Contact click: first Click that is a navigation action
        contact_click = clicks[0]
        click_ts = contact_click["timestamp"]

        console.print(f"\n  Contact click at: {fmt_relative(click_ts, base_ts)}")
        console.print(f"  Time from click to end: {recording_end_ts - click_ts}ms")

        # NavigationManager destroy happens at recorder.stop()
        # If pending navigation hasn't completed, it's discarded
        nav_min = 282  # 100ms debounce + 150ms settle + ~32ms rAF
        time_after = recording_end_ts - click_ts

        if time_after < nav_min:
            vr.add_failure(
                f"Only {time_after}ms between Contact click and recording end "
                f"(need ~{nav_min}ms minimum for NavigationManager settle)"
            )
        else:
            console.print(
                f"  [green]Enough wall-clock time ({time_after}ms > {nav_min}ms)[/green]"
            )
            console.print(
                f"  [yellow]But continuous DOM mutations may prevent settle timer completion[/yellow]"
            )

    if inputs and clicks:
        first_input_ts = inputs[0]["timestamp"]
        contact_click_ts = clicks[0]["timestamp"]
        gap = first_input_ts - contact_click_ts
        console.print(f"\n  Time from Contact click to first typing: {gap}ms")
        if gap < 250:
            vr.add_failure(
                f"Typing started {gap}ms after Contact click — "
                f"before 250ms debounce+settle cycle"
            )


def print_destroy_chain_analysis(vr: ValidationResult) -> None:
    print_header("STOP/DESTROY CHAIN ANALYSIS")

    console.print("  [bold]Cypress onTestAfterRun[/bold] → recorder.stop() (synchronous)")
    console.print("  [bold]recorder.stop()[/bold] → navigationManager.destroy()")
    console.print("  [bold]navigationManager.destroy()[/bold] → reset() → cancelTimers() + pendingNavigation = null")
    console.print()
    console.print("  If NavigationManager has a pending navigation when destroy() is called:")
    console.print("    1. All timers (debounce, settle, maxWait) are cancelled")
    console.print("    2. The settling MutationObserver is disconnected")
    console.print("    3. pendingNavigation is set to null")
    console.print("    4. [bold red]The pending FullSnapshot is NEVER emitted[/bold red]")
    console.print()
    console.print("  This is the likely root cause if the settle timer couldn't")
    console.print("  complete before recorder.stop() was called.")


def print_validation_report(vr: ValidationResult) -> None:
    print_header("VALIDATION REPORT")

    for msg in vr.passed:
        console.print(f"  [green]PASS[/green]  {msg}")
    for msg in vr.warnings:
        console.print(f"  [yellow]WARN[/yellow]  {msg}")
    for msg in vr.failures:
        console.print(f"  [red]FAIL[/red]  {msg}")

    console.print()
    total = len(vr.passed) + len(vr.warnings) + len(vr.failures)
    if vr.ok:
        console.print(
            f"[bold green]ALL CHECKS PASSED[/bold green]  "
            f"({len(vr.passed)} passed, {len(vr.warnings)} warnings)"
        )
    else:
        console.print(
            f"[bold red]VALIDATION FAILED[/bold red]  "
            f"({len(vr.failures)} failures, {len(vr.warnings)} warnings, "
            f"{len(vr.passed)} passed out of {total})"
        )


# =============================================================================
# Main
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file", "-f",
        type=Path,
        default=DEFAULT_FILE,
        help="Path to JSON report file",
    )
    args = parser.parse_args()

    try:
        print_header("CONTACT FORM SNAPSHOT ANALYSIS")
        console.print(f"[bold]File:[/bold] {args.file}")

        if not args.file.exists():
            console.print(f"[bold red]Error: file not found:[/bold red] {args.file}")
            sys.exit(1)

        # --- Read ---
        with open(args.file, "r", encoding="utf-8") as f:
            data = json.load(f)

        events = data.get("events", [])
        metadata = data.get("metadata", {})
        console.print(f"[green]Events:[/green] {len(events)}")
        recorder = metadata.get("runner", {}).get("recorder", {})
        if recorder:
            console.print(
                f"[dim]Recorder: {recorder.get('scriptVersion', '?')} / "
                f"{recorder.get('libVersion', '?')}[/dim]"
            )

        if not events:
            console.print("[bold red]No events found in report![/bold red]")
            sys.exit(1)

        base_ts = events[0].get("timestamp", 0)
        recording_end_ts = events[-1].get("timestamp", 0)

        # --- Event type distribution ---
        print_event_type_summary(events)

        # --- Session grouping ---
        sessions = group_events_by_sessions(events)
        print_session_summary(sessions)

        # --- Full event timeline ---
        print_event_timeline(events, base_ts)

        # --- Key event extraction ---
        clicks = find_click_events(events)
        snapshots = find_full_snapshots(events)
        metas = find_meta_events(events)
        inputs = find_input_events(events)

        # --- Analysis sections ---
        vr = ValidationResult()

        print_snapshot_analysis(snapshots, base_ts, vr)
        print_meta_href_analysis(metas, base_ts, vr)

        clicks_with_gaps = analyze_click_to_snapshot_gaps(clicks, snapshots)
        print_click_analysis(clicks_with_gaps, events, base_ts)
        print_input_analysis(inputs, clicks, base_ts, recording_end_ts)
        print_mutation_settle_analysis(events, clicks, recording_end_ts, base_ts)

        print_timing_summary(events, clicks, snapshots, inputs, base_ts, recording_end_ts, vr)
        print_destroy_chain_analysis(vr)

        # --- Final report ---
        print_validation_report(vr)

        sys.exit(0 if vr.ok else 1)

    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted[/yellow]")
        sys.exit(130)
    except Exception as e:
        console.print(f"\n[bold red]Error:[/bold red] {e}")
        import traceback
        console.print(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
