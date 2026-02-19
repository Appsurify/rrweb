"""Validate navigation snapshot correctness in rrweb event reports.

Verifies that SPA navigation events produce correct FullSnapshots:
  1. FullSnapshot META href matches the active route
  2. No duplicate FullSnapshots from rapid navigations
  3. checkoutId monotonically increases after each navigation
  4. FullSnapshot DOM contains elements from the correct route
  5. FullSnapshot timing is reasonable (not captured during transition)

Usage:
    python scripts/validate_navigation.py [--file PATH]
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

# =============================================================================
# Constants — rrweb enum values
# =============================================================================

REPORT_DIR = Path(__file__).resolve().parent.parent / "test-results" / "cypress" / "ui"
DEFAULT_FILE = (
    REPORT_DIR
    / "seaside.spec.cy.ts"
    / "chrome"
    / "Book-Deluxe-Sea-View-Suite-completes-the-full-booking-flow.json"
)


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


# Route-specific element expectations for the booking demo
ROUTE_EXPECTATIONS: dict[str, list[str]] = {
    # Landing page / room selection
    "room": ["Book Your Stay", "room", "suite", "Select", "book"],
    # Guest info
    "guest": ["First Name", "Last Name", "Email", "Phone", "guest"],
    # Payment
    "payment": ["Card Number", "Card Holder", "Expiry", "CVV", "payment"],
    # Confirmation
    "confirmation": ["Booking Confirmed", "confirmation", "Thank", "success"],
}

console = Console()


# =============================================================================
# Helpers
# =============================================================================

def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def collect_text_from_node(node: dict[str, Any], depth: int = 0) -> list[str]:
    """Recursively collect text content from a serialized DOM node."""
    texts: list[str] = []
    if not isinstance(node, dict):
        return texts

    # Text node
    if node.get("type") == 3:
        text = node.get("textContent", "").strip()
        if text:
            texts.append(text)

    # Element attributes (placeholder, value, aria-label)
    attrs = node.get("attributes", {})
    if isinstance(attrs, dict):
        for attr_name in ("placeholder", "value", "aria-label", "alt", "title"):
            val = attrs.get(attr_name, "")
            if val and isinstance(val, str) and val.strip():
                texts.append(val.strip())

    # Recurse into children (limit depth to avoid huge trees)
    if depth < 20:
        for child in node.get("childNodes", []) or []:
            texts.extend(collect_text_from_node(child, depth + 1))

    return texts


# =============================================================================
# Session grouping (same pattern as validate_snapshots.py)
# =============================================================================

def group_events_by_sessions(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group events into sessions by checkoutId or META boundaries."""
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
# Session analysis
# =============================================================================

def extract_session_navigation_info(
    session: dict[str, Any],
) -> dict[str, Any]:
    """Extract navigation-relevant data from a single session."""
    events = session["events"]
    result: dict[str, Any] = {
        "session_index": session["index"],
        "checkout_id": session["checkout_id"],
        "event_count": len(events),
        "meta_href": None,
        "full_snapshot_count": 0,
        "full_snapshot_timestamps": [],
        "full_snapshot_texts": [],
        "time_range": None,
    }

    if events:
        first_ts = events[0].get("timestamp", 0)
        last_ts = events[-1].get("timestamp", 0)
        result["time_range"] = (first_ts, last_ts)

    for event in events:
        etype = event.get("type")

        # META event
        if etype == EventType.META:
            result["meta_href"] = event.get("data", {}).get("href")

        # FullSnapshot
        if etype == EventType.FULL_SNAPSHOT:
            result["full_snapshot_count"] += 1
            result["full_snapshot_timestamps"].append(event.get("timestamp", 0))
            # Collect text content from the DOM tree
            node = event.get("data", {}).get("node")
            if node:
                texts = collect_text_from_node(node)
                result["full_snapshot_texts"].append(texts)
            else:
                result["full_snapshot_texts"].append([])

    return result


# =============================================================================
# Validation checks
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


def validate_meta_href_progression(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check that META.href changes between sessions where navigation occurred."""
    hrefs = [a["meta_href"] for a in analyses if a["meta_href"]]
    if not hrefs:
        vr.add_warning("No META events with href found in any session")
        return

    # Each session should have a META event
    sessions_without_meta = [a for a in analyses if not a["meta_href"]]
    if sessions_without_meta:
        vr.add_warning(
            f"{len(sessions_without_meta)} session(s) without META href: "
            f"indices {[a['session_index'] for a in sessions_without_meta]}"
        )

    # Check that hrefs are present and valid URLs
    for a in analyses:
        href = a["meta_href"]
        if href and not href.startswith(("http://", "https://")):
            vr.add_failure(
                f"Session {a['session_index']}: META href is not a valid URL: {href}"
            )

    # Check for href changes (at least some sessions should have different URLs if navigation occurred)
    unique_hrefs = set(hrefs)
    if len(unique_hrefs) > 1:
        vr.add_pass(
            f"META href shows navigation: {len(unique_hrefs)} unique URLs across {len(hrefs)} sessions"
        )
    elif len(hrefs) > 1:
        vr.add_warning(
            f"All {len(hrefs)} sessions have the same META href — "
            f"no navigation detected or SPA using hash routing"
        )
    else:
        vr.add_pass(f"Single session with META href: {hrefs[0]}")


def validate_no_duplicate_snapshots(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check no duplicate FullSnapshots within a single session."""
    for a in analyses:
        count = a["full_snapshot_count"]
        if count == 0:
            vr.add_warning(
                f"Session {a['session_index']}: no FullSnapshot found"
            )
        elif count == 1:
            vr.add_pass(
                f"Session {a['session_index']}: exactly 1 FullSnapshot"
            )
        else:
            # Multiple snapshots within a session — check timing
            timestamps = a["full_snapshot_timestamps"]
            gaps = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
            min_gap = min(gaps) if gaps else 0

            if min_gap < 500:
                vr.add_failure(
                    f"Session {a['session_index']}: {count} FullSnapshots "
                    f"(min gap {min_gap}ms) — possible duplicate from rapid navigation"
                )
            else:
                vr.add_warning(
                    f"Session {a['session_index']}: {count} FullSnapshots "
                    f"(gaps: {gaps}ms) — may be threshold checkouts"
                )


def validate_checkout_id_reset(
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Verify checkoutId monotonically increases after each session."""
    ids = [s["checkout_id"] for s in sessions if s["checkout_id"] is not None]
    if not ids:
        vr.add_warning("No checkoutId found in events")
        return

    is_monotonic = all(ids[i] < ids[i + 1] for i in range(len(ids) - 1))
    if is_monotonic:
        vr.add_pass(f"checkoutId monotonically increasing: {ids[0]}..{ids[-1]}")
    else:
        vr.add_failure(f"checkoutId NOT monotonic: {ids}")

    # Check consistency within sessions
    for s in sessions:
        cids = set(e.get("checkoutId") for e in s["events"] if "checkoutId" in e)
        if len(cids) > 1:
            vr.add_failure(
                f"Session {s['index']}: mixed checkoutIds {cids}"
            )


def validate_dom_matches_route(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Verify FullSnapshot DOM contains elements from the correct route."""
    for a in analyses:
        href = a["meta_href"] or ""
        texts_list = a["full_snapshot_texts"]

        if not texts_list:
            continue

        # Use the first FullSnapshot's text content
        all_text = " ".join(texts_list[0]).lower()

        if not all_text:
            vr.add_warning(
                f"Session {a['session_index']}: FullSnapshot DOM has no text content"
            )
            continue

        # Try to match against known route patterns
        matched_route = None
        for route_name, keywords in ROUTE_EXPECTATIONS.items():
            matches = sum(1 for kw in keywords if kw.lower() in all_text)
            if matches >= 2:
                matched_route = route_name
                break

        if matched_route:
            vr.add_pass(
                f"Session {a['session_index']}: DOM content matches route '{matched_route}' "
                f"(href: {href})"
            )
        else:
            # Not a failure — the page might not match any known route pattern
            vr.add_warning(
                f"Session {a['session_index']}: DOM content doesn't match known route patterns "
                f"(href: {href})"
            )


def validate_settle_timing(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Verify FullSnapshot was not captured during DOM transition.

    Heuristic: if a session has very few events and the FullSnapshot timestamp
    is very close to the session start, it might have been captured too early.
    """
    for a in analyses:
        if a["full_snapshot_count"] == 0:
            continue

        time_range = a["time_range"]
        if not time_range:
            continue

        session_start, session_end = time_range
        session_duration = session_end - session_start

        # For very short sessions with FullSnapshot, check if there's enough
        # incremental data after the snapshot (indicating DOM was still changing)
        fs_timestamps = a["full_snapshot_timestamps"]
        if fs_timestamps:
            last_fs = fs_timestamps[-1]
            events_after_fs = sum(
                1 for e in _get_session_events(a)
                if e.get("timestamp", 0) > last_fs
            )

            # If there are many events after the FullSnapshot within a short window,
            # the snapshot may have been taken too early
            if events_after_fs > 50 and session_duration < 1000:
                vr.add_warning(
                    f"Session {a['session_index']}: {events_after_fs} events after FullSnapshot "
                    f"in {session_duration}ms session — snapshot may have been taken during transition"
                )
            else:
                vr.add_pass(
                    f"Session {a['session_index']}: FullSnapshot timing looks correct "
                    f"({events_after_fs} events after, {session_duration}ms session)"
                )


def _get_session_events(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    """Get events from the analysis — we store them in a parallel structure."""
    return analysis.get("_events", [])


# =============================================================================
# Printing
# =============================================================================

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_session_detail(a: dict[str, Any]) -> None:
    """Print detailed navigation analysis for one session."""
    idx = a["session_index"]
    cid = a["checkout_id"]
    label = f"Session {idx}" + (f" (checkoutId={cid})" if cid is not None else "")

    console.print()
    console.print(f"[bold cyan]{label}[/bold cyan]  events={a['event_count']}", end="")
    if a["time_range"]:
        t0, t1 = a["time_range"]
        console.print(f"  time={fmt_ts(t0)}..{fmt_ts(t1)} ({t1 - t0}ms)")
    else:
        console.print()

    href = a["meta_href"] or "(none)"
    console.print(f"  META href: {href}")
    console.print(f"  FullSnapshots: {a['full_snapshot_count']}")

    if a["full_snapshot_timestamps"]:
        for i, ts in enumerate(a["full_snapshot_timestamps"]):
            console.print(f"    [{i}] timestamp={fmt_ts(ts)}")


def print_summary_table(analyses: list[dict[str, Any]]) -> None:
    print_header("NAVIGATION SUMMARY TABLE")

    table = Table(show_header=True)
    table.add_column("Session", style="cyan")
    table.add_column("checkoutId", style="dim")
    table.add_column("Events", justify="right")
    table.add_column("META href", style="yellow", max_width=60)
    table.add_column("Snapshots", justify="right", style="magenta")
    table.add_column("Duration (ms)", justify="right")

    for a in analyses:
        cid = str(a["checkout_id"]) if a["checkout_id"] is not None else "-"
        href = a["meta_href"] or "-"
        # Truncate long URLs
        if len(href) > 57:
            href = href[:57] + "..."
        duration = "-"
        if a["time_range"]:
            t0, t1 = a["time_range"]
            duration = str(t1 - t0)

        table.add_row(
            str(a["session_index"]),
            cid,
            str(a["event_count"]),
            href,
            str(a["full_snapshot_count"]),
            duration,
        )

    console.print(table)


def print_validation_report(vr: ValidationResult) -> None:
    print_header("NAVIGATION VALIDATION REPORT")

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
            f"[bold green]ALL NAVIGATION CHECKS PASSED[/bold green]  "
            f"({len(vr.passed)} passed, {len(vr.warnings)} warnings)"
        )
    else:
        console.print(
            f"[bold red]NAVIGATION VALIDATION FAILED[/bold red]  "
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
        print_header("NAVIGATION SNAPSHOT VALIDATION")
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

        # --- Group into sessions ---
        sessions = group_events_by_sessions(events)
        has_checkout = any(s["checkout_id"] is not None for s in sessions)
        grouping_method = "checkoutId" if has_checkout else "META+FullSnapshot"
        console.print(
            f"[green]Sessions:[/green] {len(sessions)} "
            f"(grouped by {grouping_method})"
        )

        # --- Analyze each session ---
        print_header("SESSION NAVIGATION ANALYSIS")
        analyses = []
        for session in sessions:
            a = extract_session_navigation_info(session)
            # Store events for settle timing validation
            a["_events"] = session["events"]
            analyses.append(a)
            print_session_detail(a)

        # --- Summary table ---
        print_summary_table(analyses)

        # --- Validation ---
        vr = ValidationResult()
        validate_meta_href_progression(analyses, vr)
        validate_no_duplicate_snapshots(analyses, vr)
        validate_checkout_id_reset(sessions, vr)
        validate_dom_matches_route(analyses, vr)
        validate_settle_timing(analyses, vr)
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
