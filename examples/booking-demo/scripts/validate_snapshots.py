"""Validate snapshot/mutation correctness in rrweb event reports.

Traces the visibility and mutation history of a specific element throughout
the event stream, verifying that:
  1. Snapshots contain correct element states
  2. Mutations are properly attributed to the correct session (checkoutId)
  3. Elements don't leak across session boundaries

Usage:
    python scripts/validate_snapshots.py [--file PATH] [--selector SELECTOR]
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
from rich.tree import Tree

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
DEFAULT_SELECTOR = (
    'v1.0: form#2 :: div.glass-card#3 > div[role="tabpanel"]#2'
    ' > input[id="cardName",name="cardName"]'
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


SOURCE_NAMES = {
    0: "Mutation", 1: "MouseMove", 2: "MouseInteraction", 3: "Scroll",
    4: "ViewportResize", 5: "Input", 6: "TouchMove", 7: "MediaInteraction",
    8: "StyleSheetRule", 9: "CanvasMutation", 10: "Font", 11: "Log",
    12: "Drag", 13: "StyleDeclaration", 14: "Selection",
    15: "AdoptedStyleSheet", 16: "CustomElement", 17: "Visibility",
}

console = Console()


# =============================================================================
# Helpers
# =============================================================================

def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def find_element_by_selector(
    node: dict[str, Any], selector: str,
) -> dict[str, Any] | None:
    if not isinstance(node, dict):
        return None
    if node.get("selector") == selector:
        return node
    for child in node.get("childNodes", []) or []:
        found = find_element_by_selector(child, selector)
        if found:
            return found
    return None


# =============================================================================
# Session grouping
# =============================================================================

def group_events_by_sessions(
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Group events into sessions.

    Uses checkoutId if present, otherwise falls back to META + FullSnapshot
    boundaries.  Returns a list of session dicts:
        {
            "index": int,
            "checkout_id": int | None,
            "events": [...],
        }
    """
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
# Per-session analysis
# =============================================================================

def analyze_session(
    session: dict[str, Any],
    target_selector: str,
) -> dict[str, Any]:
    """Trace target element through a single session."""
    events = session["events"]
    result: dict[str, Any] = {
        "session_index": session["index"],
        "checkout_id": session["checkout_id"],
        "event_count": len(events),
        "element_id": None,
        "element_found": False,
        "found_in": None,
        "initial_visibility": None,
        "visibility_changes": [],
        "final_visibility": None,
        "has_visibility_mutations": False,
        "all_visibility_mutations": [],
        "mutation_position_pct": None,
        "events_after_mutation": None,
        "likely_belongs_to_next": False,
        "attribute_mutations": [],
        "time_range": None,
    }

    if events:
        first_ts = events[0].get("timestamp", 0)
        last_ts = events[-1].get("timestamp", 0)
        result["time_range"] = (first_ts, last_ts)

    element_id = None

    # --- 1. Search in FullSnapshot DOM tree ---
    for event in events:
        if event.get("type") == EventType.FULL_SNAPSHOT:
            node = event.get("data", {}).get("node")
            if node:
                el = find_element_by_selector(node, target_selector)
                if el:
                    element_id = el.get("id")
                    result["element_id"] = element_id
                    result["initial_visibility"] = el.get("isVisible", False)
                    result["element_found"] = True
                    result["found_in"] = "FULL_SNAPSHOT"
                    break

    # --- 2. Search in MUTATION.adds ---
    if not element_id:
        for event_idx, event in enumerate(events):
            if (
                event.get("type") == EventType.INCREMENTAL_SNAPSHOT
                and event.get("data", {}).get("source") == IncrementalSource.MUTATION
            ):
                for add in event.get("data", {}).get("adds", []) or []:
                    node = add.get("node", {})
                    if node.get("selector") == target_selector:
                        element_id = node.get("id")
                        result["element_id"] = element_id
                        result["initial_visibility"] = node.get("isVisible", False)
                        result["element_found"] = True
                        result["found_in"] = "MUTATION.adds"

                        total = len(events)
                        events_after = total - event_idx - 1
                        position_pct = (event_idx / total * 100) if total else 0
                        result["mutation_position_pct"] = position_pct
                        result["events_after_mutation"] = events_after

                        if events_after <= 3 and position_pct >= 50:
                            result["likely_belongs_to_next"] = True

                        result["mutation_add_event_idx"] = event_idx
                        result["mutation_add_timestamp"] = event.get("timestamp", 0)
                        break
            if element_id:
                break

    if not element_id:
        return result

    # --- 3. Track VISIBILITY mutations ---
    for event in events:
        if (
            event.get("type") == EventType.INCREMENTAL_SNAPSHOT
            and event.get("data", {}).get("source") == IncrementalSource.VISIBILITY
        ):
            result["has_visibility_mutations"] = True
            mutations = event.get("data", {}).get("mutations", []) or []
            result["all_visibility_mutations"].extend(mutations)

            for m in mutations:
                if m.get("id") == element_id:
                    result["visibility_changes"].append({
                        "timestamp": event.get("timestamp", 0),
                        "isVisible": m.get("isVisible"),
                        "ratio": m.get("ratio"),
                    })

    # --- 4. Track attribute mutations referencing element ---
    for event in events:
        if (
            event.get("type") == EventType.INCREMENTAL_SNAPSHOT
            and event.get("data", {}).get("source") == IncrementalSource.MUTATION
        ):
            for attr in event.get("data", {}).get("attributes", []) or []:
                if attr.get("id") == element_id:
                    result["attribute_mutations"].append({
                        "timestamp": event.get("timestamp", 0),
                        "attributes": attr.get("attributes", {}),
                    })

    # --- 5. Final visibility ---
    if result["visibility_changes"]:
        result["final_visibility"] = result["visibility_changes"][-1]["isVisible"]
    else:
        result["final_visibility"] = result["initial_visibility"]

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


def validate_checkout_ids(
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check that checkoutId monotonically increases across sessions."""
    ids = [s["checkout_id"] for s in sessions if s["checkout_id"] is not None]
    if not ids:
        vr.add_warning("No checkoutId found in events (legacy grouping used)")
        return

    is_monotonic = all(ids[i] < ids[i + 1] for i in range(len(ids) - 1))
    if is_monotonic:
        vr.add_pass(f"checkoutId monotonically increasing: {ids[0]}..{ids[-1]}")
    else:
        vr.add_failure(f"checkoutId NOT monotonic: {ids}")

    # All events within a session should share the same checkoutId
    for s in sessions:
        cids = set(e.get("checkoutId") for e in s["events"] if "checkoutId" in e)
        if len(cids) > 1:
            vr.add_failure(
                f"Session {s['index']}: mixed checkoutIds {cids}"
            )


def validate_session_boundaries(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check that elements added via MUTATION.adds don't leak across boundaries."""
    for a in analyses:
        if a.get("likely_belongs_to_next"):
            vr.add_failure(
                f"Session {a['session_index']}: element added via MUTATION.adds "
                f"at {a['mutation_position_pct']:.0f}% of stream "
                f"({a['events_after_mutation']} events after) — "
                f"likely belongs to next session"
            )

    if not any(a.get("likely_belongs_to_next") for a in analyses):
        found_in_mutation = [a for a in analyses if a.get("found_in") == "MUTATION.adds"]
        if found_in_mutation:
            for a in found_in_mutation:
                vr.add_pass(
                    f"Session {a['session_index']}: MUTATION.adds at "
                    f"{a['mutation_position_pct']:.0f}% — acceptable position"
                )
        else:
            vr.add_pass("No MUTATION.adds boundary issues detected")


def validate_visibility_consistency(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check for problematic visibility patterns."""
    for a in analyses:
        if not a["element_found"]:
            continue

        changes = a["visibility_changes"]
        if not changes:
            continue

        became_visible = any(c["isVisible"] for c in changes)
        final = a["final_visibility"]

        if became_visible and final is False:
            vr.add_failure(
                f"Session {a['session_index']}: element became visible "
                f"then reverted to invisible ({len(changes)} changes)"
            )
        else:
            vr.add_pass(
                f"Session {a['session_index']}: visibility changes consistent "
                f"({len(changes)} changes, final={final})"
            )


def validate_snapshot_element_presence(
    analyses: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    """Check element presence across sessions for correctness."""
    found_sessions = [a for a in analyses if a["element_found"]]
    not_found = [a for a in analyses if not a["element_found"]]

    if not found_sessions:
        vr.add_failure("Element not found in ANY session")
        return

    vr.add_pass(
        f"Element found in {len(found_sessions)}/{len(analyses)} sessions "
        f"(IDs: {[a['element_id'] for a in found_sessions]})"
    )

    # Check ID consistency — element should keep same ID within a session chain
    ids = set(a["element_id"] for a in found_sessions)
    if len(ids) > 1:
        vr.add_warning(
            f"Element has multiple IDs across sessions: {ids} "
            f"(expected if snapshots reassign IDs)"
        )


# =============================================================================
# Printing
# =============================================================================

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_session_detail(
    a: dict[str, Any],
    session: dict[str, Any],
) -> None:
    """Print detailed analysis for one session."""
    idx = a["session_index"]
    cid = a["checkout_id"]
    label = f"Session {idx}" + (f" (checkoutId={cid})" if cid is not None else "")
    events = session["events"]

    console.print()
    console.print(f"[bold cyan]{label}[/bold cyan]  events={len(events)}", end="")
    if a["time_range"]:
        t0, t1 = a["time_range"]
        console.print(f"  time={fmt_ts(t0)}..{fmt_ts(t1)} ({t1 - t0}ms)")
    else:
        console.print()

    if not a["element_found"]:
        console.print("  [dim]Element not found in this session[/dim]")
        return

    found_in = a["found_in"]
    eid = a["element_id"]
    vis = a["initial_visibility"]

    if found_in == "FULL_SNAPSHOT":
        console.print(
            f"  [green]Found in FULL_SNAPSHOT[/green]  "
            f"id={eid}  isVisible={vis}"
        )
    elif found_in == "MUTATION.adds":
        evt_idx = a.get("mutation_add_event_idx", "?")
        pos = a.get("mutation_position_pct", 0)
        after = a.get("events_after_mutation", 0)
        ts = a.get("mutation_add_timestamp", 0)

        style = "bold red" if a["likely_belongs_to_next"] else "yellow"
        console.print(
            f"  [{style}]Found in MUTATION.adds[/{style}]  "
            f"id={eid}  isVisible={vis}"
        )
        console.print(
            f"    event_idx={evt_idx}/{len(events)}  "
            f"position={pos:.1f}%  events_after={after}  "
            f"time={fmt_ts(ts)}"
        )

        if a["likely_belongs_to_next"]:
            console.print(
                f"    [bold red]CRITICAL: element added at END of stream — "
                f"likely belongs to next session![/bold red]"
            )

        # Context: events around the mutation
        console.print("    [dim]Context (3 events before/after):[/dim]")
        for i in range(max(0, evt_idx - 3), min(evt_idx + 4, len(events))):
            e = events[i]
            marker = " >>>" if i == evt_idx else "    "
            etype = e.get("type")
            src = e.get("data", {}).get("source") if isinstance(e.get("data"), dict) else None
            src_name = SOURCE_NAMES.get(src, str(src)) if src is not None else ""
            console.print(
                f"    {marker} [{i}] type={etype} "
                f"{'source=' + src_name + ' ' if src_name else ''}"
                f"ts={fmt_ts(e.get('timestamp', 0))}"
            )

    # Visibility changes
    if a["visibility_changes"]:
        tree = Tree("[bold]Visibility changes:[/bold]")
        for c in a["visibility_changes"]:
            style = "green" if c["isVisible"] else "red"
            ratio = f" ratio={c['ratio']:.2f}" if c.get("ratio") is not None else ""
            tree.add(Text(
                f"{fmt_ts(c['timestamp'])}: isVisible={c['isVisible']}{ratio}",
                style=style,
            ))
        console.print(tree)

    # Attribute mutations
    if a["attribute_mutations"]:
        console.print(f"  [dim]Attribute mutations: {len(a['attribute_mutations'])}[/dim]")
        for am in a["attribute_mutations"][:5]:
            console.print(
                f"    {fmt_ts(am['timestamp'])}: {am['attributes']}"
            )
        if len(a["attribute_mutations"]) > 5:
            console.print(f"    ... and {len(a['attribute_mutations']) - 5} more")


def print_summary_table(analyses: list[dict[str, Any]]) -> None:
    print_header("SUMMARY TABLE")

    table = Table(show_header=True)
    table.add_column("Session", style="cyan")
    table.add_column("checkoutId", style="dim")
    table.add_column("Events", justify="right")
    table.add_column("Element ID", style="yellow")
    table.add_column("Found In", style="dim")
    table.add_column("Initial Vis", style="green")
    table.add_column("Vis Changes", justify="right", style="magenta")
    table.add_column("Final Vis")
    table.add_column("Issue?", style="bold")

    for a in analyses:
        issues = []
        if a.get("likely_belongs_to_next"):
            issues.append("BOUNDARY")
        if a["visibility_changes"]:
            became_vis = any(c["isVisible"] for c in a["visibility_changes"])
            if became_vis and a["final_visibility"] is False:
                issues.append("VIS_FLICKER")

        issue_str = "[red]" + ",".join(issues) + "[/red]" if issues else "[green]OK[/green]"
        if not a["element_found"]:
            issue_str = "[dim]—[/dim]"

        cid = str(a["checkout_id"]) if a["checkout_id"] is not None else "—"
        eid = str(a["element_id"]) if a["element_id"] else "—"
        found = a["found_in"] or "—"
        init_vis = str(a["initial_visibility"]) if a["element_found"] else "—"
        final_vis = str(a["final_visibility"]) if a["element_found"] else "—"
        vis_changes = str(len(a["visibility_changes"])) if a["element_found"] else "—"

        table.add_row(
            str(a["session_index"]),
            cid,
            str(a["event_count"]),
            eid,
            found,
            init_vis,
            vis_changes,
            final_vis,
            issue_str,
        )

    console.print(table)


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
    parser.add_argument(
        "--selector", "-s",
        type=str,
        default=DEFAULT_SELECTOR,
        help="SEQL selector of the target element",
    )
    args = parser.parse_args()

    try:
        print_header("SNAPSHOT & MUTATION VALIDATION")
        console.print(f"[bold]File:[/bold] {args.file}")
        console.print(f"[bold]Selector:[/bold] {args.selector}")

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
        print_header("SESSION ANALYSIS")
        analyses = []
        for session in sessions:
            a = analyze_session(session, args.selector)
            analyses.append(a)
            print_session_detail(a, session)

        # --- Summary table ---
        print_summary_table(analyses)

        # --- Validation ---
        vr = ValidationResult()
        validate_checkout_ids(sessions, vr)
        validate_session_boundaries(analyses, vr)
        validate_visibility_consistency(analyses, vr)
        validate_snapshot_element_presence(analyses, vr)
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
