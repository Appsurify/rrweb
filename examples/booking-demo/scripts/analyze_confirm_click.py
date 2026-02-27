"""Analyze whether the "Confirm Booking" click event survives backend processing.

Investigates the full-booking-flow test report to determine:
  1. Whether the click event exists in raw rrweb JSON
  2. Whether the target element exists in the session's FullSnapshot or MUTATION.adds
  3. Whether backend filters (look-ahead, heuristic) would remove the element
  4. Whether the click would be processed by collect_actions()

Backend context: collectors.py:299-302 drops click events when the clicked
element's node_id is missing from node_map. Elements enter node_map from
FullSnapshot DOM or MUTATION.adds, but two filters can exclude them:
  - Look-ahead filter (builders.py:322-333): skips if selector exists in next FS
  - Heuristic filter (builders.py:335-347): skips if position >= 50% AND events_after <= 3

Usage:
    python scripts/analyze_confirm_click.py [--file PATH]
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
    / "full-booking-flow.spec.cy.ts"
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


def find_node_by_id(
    node: dict[str, Any], target_id: int, depth: int = 0,
) -> dict[str, Any] | None:
    """Find a node by its ID in a serialized DOM tree."""
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


def find_node_by_selector(
    node: dict[str, Any], selector: str, depth: int = 0,
) -> dict[str, Any] | None:
    """Find a node by its selector in a serialized DOM tree."""
    if not isinstance(node, dict):
        return None
    if node.get("selector") == selector:
        return node
    if depth < 100:
        for child in node.get("childNodes", []) or []:
            found = find_node_by_selector(child, selector, depth + 1)
            if found:
                return found
    return None


def collect_all_node_ids(node: dict[str, Any], depth: int = 0) -> set[int]:
    """Collect all node IDs from a serialized DOM tree."""
    ids: set[int] = set()
    if not isinstance(node, dict):
        return ids
    nid = node.get("id")
    if nid is not None:
        ids.add(nid)
    if depth < 100:
        for child in node.get("childNodes", []) or []:
            ids.update(collect_all_node_ids(child, depth + 1))
    return ids


def collect_all_selectors(node: dict[str, Any], depth: int = 0) -> set[str]:
    """Collect all selectors from a serialized DOM tree."""
    selectors: set[str] = set()
    if not isinstance(node, dict):
        return selectors
    sel = node.get("selector")
    if sel:
        selectors.add(sel)
    if depth < 100:
        for child in node.get("childNodes", []) or []:
            selectors.update(collect_all_selectors(child, depth + 1))
    return selectors


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
        if data.get("type") != 2:  # Click
            continue
        clicks.append({
            "event_index": i,
            "timestamp": event.get("timestamp", 0),
            "node_id": data.get("id"),
            "x": data.get("x"),
            "y": data.get("y"),
            "selector": data.get("selector", ""),
            "checkout_id": event.get("checkoutId"),
        })
    return clicks


def find_full_snapshots(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all FullSnapshot events with their indices."""
    snapshots = []
    for i, event in enumerate(events):
        if event.get("type") == EventType.FULL_SNAPSHOT:
            snapshots.append({
                "event_index": i,
                "timestamp": event.get("timestamp", 0),
                "checkout_id": event.get("checkoutId"),
                "node": event.get("data", {}).get("node"),
            })
    return snapshots


def resolve_node_for_click(
    click: dict[str, Any],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
) -> dict[str, Any]:
    """Resolve the DOM node for a click event.

    Searches the nearest preceding FullSnapshot, then MUTATION.adds,
    for the node with the click's target node_id.
    """
    node_id = click["node_id"]
    click_idx = click["event_index"]
    result: dict[str, Any] = {
        "found": False,
        "found_in": None,
        "tag": None,
        "selector": None,
        "text": [],
        "node": None,
    }

    # Search preceding FullSnapshot (nearest one before or at the click)
    nearest_fs = None
    for snap in reversed(snapshots):
        if snap["event_index"] <= click_idx:
            nearest_fs = snap
            break

    if nearest_fs and nearest_fs["node"]:
        node = find_node_by_id(nearest_fs["node"], node_id)
        if node:
            result["found"] = True
            result["found_in"] = f"FullSnapshot[{nearest_fs['event_index']}]"
            result["tag"] = node.get("tagName", "")
            result["selector"] = node.get("selector", "")
            result["text"] = collect_text_from_node(node)
            result["node"] = node
            return result

    # Search MUTATION.adds between nearest FS and click
    start_idx = nearest_fs["event_index"] + 1 if nearest_fs else 0
    for i in range(start_idx, click_idx + 1):
        event = events[i]
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for add in data.get("adds", []) or []:
            node = add.get("node", {})
            if node.get("id") == node_id:
                result["found"] = True
                result["found_in"] = f"MUTATION.adds[{i}]"
                result["tag"] = node.get("tagName", "")
                result["selector"] = node.get("selector", "")
                result["text"] = collect_text_from_node(node)
                result["node"] = node
                return result

    # Also search MUTATION.adds after the click (in same session)
    click_cid = click["checkout_id"]
    for i in range(click_idx + 1, len(events)):
        event = events[i]
        if event.get("checkoutId") != click_cid:
            break
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for add in data.get("adds", []) or []:
            node = add.get("node", {})
            if node.get("id") == node_id:
                result["found"] = True
                result["found_in"] = f"MUTATION.adds[{i}] (after click)"
                result["tag"] = node.get("tagName", "")
                result["selector"] = node.get("selector", "")
                result["text"] = collect_text_from_node(node)
                result["node"] = node
                return result

    return result


def simulate_backend_node_map(
    session_events: list[dict[str, Any]],
    next_session_fs_node: dict[str, Any] | None,
) -> dict[str, Any]:
    """Simulate how the backend builds node_map for a session.

    Returns dict with:
      - node_map: {node_id: node_info}
      - mutation_adds: list of elements added via MUTATION.adds
      - filtered_by_lookahead: list of elements filtered by look-ahead
      - filtered_by_heuristic: list of elements filtered by heuristic
    """
    node_map: dict[int, dict[str, Any]] = {}
    mutation_adds: list[dict[str, Any]] = []
    filtered_by_lookahead: list[dict[str, Any]] = []
    filtered_by_heuristic: list[dict[str, Any]] = []

    # Collect selectors from next session's FullSnapshot (for look-ahead filter)
    next_fs_selectors: set[str] = set()
    if next_session_fs_node:
        next_fs_selectors = collect_all_selectors(next_session_fs_node)

    # 1. Build node_map from FullSnapshot
    for event in session_events:
        if event.get("type") == EventType.FULL_SNAPSHOT:
            fs_node = event.get("data", {}).get("node")
            if fs_node:
                fs_ids = collect_all_node_ids(fs_node)
                for nid in fs_ids:
                    node = find_node_by_id(fs_node, nid)
                    if node:
                        node_map[nid] = {
                            "id": nid,
                            "source": "FULL_SNAPSHOT",
                            "tag": node.get("tagName", ""),
                            "selector": node.get("selector", ""),
                        }
            break  # Only first FullSnapshot

    # 2. Add MUTATION.adds elements (with filtering)
    total_events = len(session_events)
    for event_idx, event in enumerate(session_events):
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue

        for add in data.get("adds", []) or []:
            node = add.get("node", {})
            nid = node.get("id")
            selector = node.get("selector", "")
            if nid is None:
                continue

            add_info = {
                "id": nid,
                "tag": node.get("tagName", ""),
                "selector": selector,
                "event_idx": event_idx,
                "position_pct": (event_idx / total_events * 100) if total_events else 0,
                "events_after": total_events - event_idx - 1,
            }
            mutation_adds.append(add_info)

            # Look-ahead filter: skip if selector exists in next FS
            if selector and selector in next_fs_selectors:
                add_info["filtered_reason"] = "look-ahead"
                filtered_by_lookahead.append(add_info)
                continue

            # Heuristic filter: skip if position >= 50% AND events_after <= 3
            position_pct = add_info["position_pct"]
            events_after = add_info["events_after"]
            if position_pct >= 50 and events_after <= 3:
                add_info["filtered_reason"] = "heuristic"
                filtered_by_heuristic.append(add_info)
                continue

            # Element passes both filters — add to node_map
            if nid not in node_map:
                node_map[nid] = {
                    "id": nid,
                    "source": "MUTATION.adds",
                    "tag": node.get("tagName", ""),
                    "selector": selector,
                }

            # Also collect child node IDs recursively
            child_ids = collect_all_node_ids(node)
            for child_id in child_ids:
                if child_id not in node_map:
                    child_node = find_node_by_id(node, child_id)
                    if child_node:
                        node_map[child_id] = {
                            "id": child_id,
                            "source": "MUTATION.adds (child)",
                            "tag": child_node.get("tagName", ""),
                            "selector": child_node.get("selector", ""),
                        }

    return {
        "node_map": node_map,
        "mutation_adds": mutation_adds,
        "filtered_by_lookahead": filtered_by_lookahead,
        "filtered_by_heuristic": filtered_by_heuristic,
    }


# =============================================================================
# Printing
# =============================================================================

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_raw_click_inventory(
    clicks: list[dict[str, Any]],
    base_ts: int,
) -> None:
    print_header("1. RAW CLICK INVENTORY")

    if not clicks:
        console.print("  [dim]No click events found[/dim]")
        return

    table = Table(show_header=True, show_lines=False)
    table.add_column("#", style="dim", justify="right", width=3)
    table.add_column("Evt#", style="dim", justify="right", width=5)
    table.add_column("Time", width=14)
    table.add_column("Rel", style="dim", width=10)
    table.add_column("Node ID", justify="right", width=8)
    table.add_column("x", justify="right", width=5)
    table.add_column("y", justify="right", width=5)
    table.add_column("CID", justify="right", width=4)
    table.add_column("Selector", max_width=50)

    for i, click in enumerate(clicks):
        sel = click["selector"] or "[dim]-[/dim]"
        table.add_row(
            str(i),
            str(click["event_index"]),
            fmt_ts(click["timestamp"]),
            fmt_relative(click["timestamp"], base_ts),
            str(click["node_id"]),
            str(click["x"]),
            str(click["y"]),
            str(click["checkout_id"]),
            sel[:50] if isinstance(sel, str) else sel,
        )

    console.print(table)
    console.print(f"\n  Total click events: [bold]{len(clicks)}[/bold]")


def print_confirm_click_identification(
    clicks: list[dict[str, Any]],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    base_ts: int,
    vr: ValidationResult,
) -> dict[str, Any] | None:
    """Identify and print details for the Confirm Booking click.

    Returns the click dict if found, else None.
    """
    print_header("2. IDENTIFY 'CONFIRM BOOKING' CLICK")

    confirm_click = None
    confirm_resolution = None

    for click in clicks:
        resolution = resolve_node_for_click(click, events, snapshots)
        text = " ".join(resolution["text"]).lower()
        if "confirm booking" in text:
            confirm_click = click
            confirm_resolution = resolution
            break

    if not confirm_click:
        console.print("  [bold red]'Confirm Booking' click NOT FOUND in any click event![/bold red]")
        console.print("  Checked all clicks by resolving target node text.")
        vr.add_failure("'Confirm Booking' click not found in raw events")
        return None

    console.print(f"  [bold green]FOUND[/bold green] 'Confirm Booking' click:")
    console.print(f"    Event index:  {confirm_click['event_index']}")
    console.print(f"    Timestamp:    {fmt_ts(confirm_click['timestamp'])} ({fmt_relative(confirm_click['timestamp'], base_ts)})")
    console.print(f"    Node ID:      {confirm_click['node_id']}")
    console.print(f"    Coordinates:  ({confirm_click['x']}, {confirm_click['y']})")
    console.print(f"    checkoutId:   {confirm_click['checkout_id']}")
    console.print(f"    Click selector: {confirm_click['selector'] or '(empty)'}")
    console.print()
    console.print(f"    Resolved element:")
    console.print(f"      Found in:   {confirm_resolution['found_in']}")
    console.print(f"      Tag:        <{confirm_resolution['tag']}>")
    console.print(f"      Selector:   {confirm_resolution['selector']}")
    console.print(f"      Text:       {confirm_resolution['text']}")

    vr.add_pass(f"'Confirm Booking' click exists in raw events (event[{confirm_click['event_index']}], node_id={confirm_click['node_id']})")

    return confirm_click


def print_element_resolution(
    confirm_click: dict[str, Any],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("3. ELEMENT RESOLUTION — WHERE DOES NODE LIVE?")

    node_id = confirm_click["node_id"]
    click_cid = confirm_click["checkout_id"]
    console.print(f"  Target node_id: {node_id}")
    console.print(f"  Click session (checkoutId): {click_cid}")
    console.print()

    # Search ALL FullSnapshots
    console.print("  [bold]Search in FullSnapshots:[/bold]")
    found_in_any_fs = False
    found_in_same_session_fs = False
    for snap in snapshots:
        if snap["node"]:
            node = find_node_by_id(snap["node"], node_id)
            if node:
                found_in_any_fs = True
                same_session = snap["checkout_id"] == click_cid
                if same_session:
                    found_in_same_session_fs = True
                marker = "[green]SAME SESSION[/green]" if same_session else "[dim]different session[/dim]"
                console.print(
                    f"    [green]FOUND[/green] in FS[{snap['event_index']}] "
                    f"(cid={snap['checkout_id']}) {marker}"
                )
                console.print(f"      tag=<{node.get('tagName', '')}>  selector={node.get('selector', '')}")
                texts = collect_text_from_node(node)
                console.print(f"      text={texts}")

    if not found_in_any_fs:
        console.print("    [red]NOT FOUND[/red] in any FullSnapshot")

    # Search MUTATION.adds across all events
    console.print()
    console.print("  [bold]Search in MUTATION.adds:[/bold]")
    found_in_mutation = False
    for i, event in enumerate(events):
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for add in data.get("adds", []) or []:
            node = add.get("node", {})
            if node.get("id") == node_id:
                found_in_mutation = True
                same_session = event.get("checkoutId") == click_cid
                marker = "[green]SAME SESSION[/green]" if same_session else "[dim]different session[/dim]"
                console.print(
                    f"    [green]FOUND[/green] in MUTATION.adds[{i}] "
                    f"(cid={event.get('checkoutId')}) {marker}"
                )
                console.print(f"      tag=<{node.get('tagName', '')}>  selector={node.get('selector', '')}")
                texts = collect_text_from_node(node)
                console.print(f"      text={texts}")

    if not found_in_mutation:
        console.print("    [dim]Not found in any MUTATION.adds[/dim]")

    # Validation
    if found_in_same_session_fs:
        vr.add_pass(f"Node {node_id} found in same-session FullSnapshot")
    elif found_in_any_fs:
        vr.add_warning(f"Node {node_id} found in FullSnapshot but in different session")
    elif found_in_mutation:
        vr.add_warning(f"Node {node_id} only found in MUTATION.adds (subject to backend filters)")
    else:
        vr.add_failure(f"Node {node_id} NOT FOUND in any FullSnapshot or MUTATION.adds")


def print_backend_simulation(
    confirm_click: dict[str, Any],
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("4. BACKEND SIMULATION — collect_actions() NODE MAP")

    node_id = confirm_click["node_id"]
    click_cid = confirm_click["checkout_id"]

    # Find the session containing the click
    click_session = None
    click_session_idx = None
    for i, session in enumerate(sessions):
        if session["checkout_id"] == click_cid:
            click_session = session
            click_session_idx = i
            break

    if not click_session:
        console.print(f"  [bold red]Session with checkoutId={click_cid} not found![/bold red]")
        vr.add_failure(f"Could not find session for checkoutId={click_cid}")
        return

    # Find next session's FullSnapshot (for look-ahead filter)
    next_fs_node = None
    if click_session_idx is not None and click_session_idx + 1 < len(sessions):
        next_session = sessions[click_session_idx + 1]
        for event in next_session["events"]:
            if event.get("type") == EventType.FULL_SNAPSHOT:
                next_fs_node = event.get("data", {}).get("node")
                break

    console.print(f"  Session: {click_session_idx} (checkoutId={click_cid})")
    console.print(f"  Events in session: {len(click_session['events'])}")
    console.print(f"  Next session FS available: {'Yes' if next_fs_node else 'No'}")
    console.print()

    # Simulate backend
    result = simulate_backend_node_map(click_session["events"], next_fs_node)
    node_map = result["node_map"]

    console.print(f"  [bold]Node map size:[/bold] {len(node_map)} entries")
    console.print(f"  [bold]MUTATION.adds elements:[/bold] {len(result['mutation_adds'])}")
    console.print(f"  [bold]Filtered by look-ahead:[/bold] {len(result['filtered_by_lookahead'])}")
    console.print(f"  [bold]Filtered by heuristic:[/bold] {len(result['filtered_by_heuristic'])}")

    # Check if target node is in node_map
    console.print()
    if node_id in node_map:
        entry = node_map[node_id]
        console.print(f"  [bold green]Node {node_id} IS in node_map[/bold green]")
        console.print(f"    Source: {entry['source']}")
        console.print(f"    Tag: <{entry['tag']}>")
        console.print(f"    Selector: {entry['selector']}")
        vr.add_pass(f"Node {node_id} present in simulated node_map (source: {entry['source']})")
    else:
        console.print(f"  [bold red]Node {node_id} NOT in node_map — click would be DROPPED![/bold red]")
        vr.add_failure(f"Node {node_id} missing from simulated node_map — backend drops click")

        # Check if it was filtered
        for item in result["filtered_by_lookahead"]:
            if item["id"] == node_id:
                console.print(f"    Reason: filtered by look-ahead (selector exists in next FS)")
                console.print(f"    Selector: {item['selector']}")
                break
        for item in result["filtered_by_heuristic"]:
            if item["id"] == node_id:
                console.print(
                    f"    Reason: filtered by heuristic "
                    f"(position={item['position_pct']:.1f}%, events_after={item['events_after']})"
                )
                break


def print_filter_analysis(
    confirm_click: dict[str, Any],
    sessions: list[dict[str, Any]],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("5. FILTER ANALYSIS — DETAILED")

    node_id = confirm_click["node_id"]
    click_cid = confirm_click["checkout_id"]

    # Resolve element info
    resolution = resolve_node_for_click(confirm_click, events, snapshots)
    if not resolution["found"]:
        console.print("  [dim]Element not found — cannot analyze filters[/dim]")
        return

    element_selector = resolution["selector"]
    found_in = resolution["found_in"]

    console.print(f"  Element: <{resolution['tag']}> id={node_id}")
    console.print(f"  Selector: {element_selector}")
    console.print(f"  Found in: {found_in}")
    console.print()

    # Check if element is in MUTATION.adds (filters only apply to mutation adds)
    is_in_mutation = "MUTATION" in (found_in or "")

    if not is_in_mutation:
        console.print("  [green]Element is in FullSnapshot — backend filters do NOT apply[/green]")
        console.print("  (Look-ahead and heuristic filters only affect MUTATION.adds elements)")
        vr.add_pass("Element in FullSnapshot — immune to backend filters")
        return

    # Find click session
    click_session = None
    click_session_idx = None
    for i, session in enumerate(sessions):
        if session["checkout_id"] == click_cid:
            click_session = session
            click_session_idx = i
            break

    if not click_session:
        return

    session_events = click_session["events"]
    total_events = len(session_events)

    # Find the mutation event containing this element
    mutation_event_idx = None
    for idx, event in enumerate(session_events):
        if event.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = event.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for add in data.get("adds", []) or []:
            if add.get("node", {}).get("id") == node_id:
                mutation_event_idx = idx
                break
        if mutation_event_idx is not None:
            break

    if mutation_event_idx is None:
        console.print("  [yellow]Element not found in MUTATION.adds within its session[/yellow]")
        return

    position_pct = (mutation_event_idx / total_events * 100) if total_events else 0
    events_after = total_events - mutation_event_idx - 1

    console.print(f"  Mutation position: event {mutation_event_idx}/{total_events} ({position_pct:.1f}%)")
    console.print(f"  Events after mutation: {events_after}")
    console.print()

    # Look-ahead filter
    console.print("  [bold]Look-ahead filter:[/bold]")
    if click_session_idx is not None and click_session_idx + 1 < len(sessions):
        next_session = sessions[click_session_idx + 1]
        next_fs_node = None
        for event in next_session["events"]:
            if event.get("type") == EventType.FULL_SNAPSHOT:
                next_fs_node = event.get("data", {}).get("node")
                break

        if next_fs_node and element_selector:
            next_selectors = collect_all_selectors(next_fs_node)
            if element_selector in next_selectors:
                console.print(f"    [red]WOULD FILTER: selector exists in next FS[/red]")
                console.print(f"    Selector: {element_selector}")
                vr.add_failure(f"Look-ahead filter would remove node {node_id}")
            else:
                console.print(f"    [green]PASSES: selector NOT in next FS[/green]")
                vr.add_pass(f"Node {node_id} survives look-ahead filter")
        else:
            console.print(f"    [green]PASSES: no next FS or no selector[/green]")
            vr.add_pass(f"Node {node_id} survives look-ahead filter (no next FS)")
    else:
        console.print(f"    [green]PASSES: no next session[/green]")
        vr.add_pass(f"Node {node_id} survives look-ahead filter (no next session)")

    # Heuristic filter
    console.print()
    console.print("  [bold]Heuristic filter:[/bold]")
    console.print(f"    position >= 50%? {position_pct:.1f}% {'YES' if position_pct >= 50 else 'NO'}")
    console.print(f"    events_after <= 3? {events_after} {'YES' if events_after <= 3 else 'NO'}")

    if position_pct >= 50 and events_after <= 3:
        console.print(f"    [red]WOULD FILTER: both conditions met[/red]")
        vr.add_failure(f"Heuristic filter would remove node {node_id}")
    else:
        console.print(f"    [green]PASSES: at least one condition not met[/green]")
        vr.add_pass(f"Node {node_id} survives heuristic filter")


def print_all_clicks_summary(
    clicks: list[dict[str, Any]],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    base_ts: int,
) -> None:
    print_header("6. ALL CLICKS — ELEMENT RESOLUTION & BACKEND STATUS")

    table = Table(show_header=True, show_lines=True)
    table.add_column("#", style="dim", justify="right", width=3)
    table.add_column("Rel", style="dim", width=10)
    table.add_column("Node", justify="right", width=6)
    table.add_column("CID", justify="right", width=4)
    table.add_column("Tag", width=8)
    table.add_column("Text", max_width=25)
    table.add_column("Selector", max_width=50)
    table.add_column("Found In", width=20)
    table.add_column("Backend", width=10)

    for i, click in enumerate(clicks):
        resolution = resolve_node_for_click(click, events, snapshots)

        # Simulate backend for this click's session
        click_cid = click["checkout_id"]
        click_session = None
        click_session_idx = None
        for si, session in enumerate(sessions):
            if session["checkout_id"] == click_cid:
                click_session = session
                click_session_idx = si
                break

        backend_status = "[dim]?[/dim]"
        if click_session:
            next_fs_node = None
            if click_session_idx is not None and click_session_idx + 1 < len(sessions):
                next_session = sessions[click_session_idx + 1]
                for event in next_session["events"]:
                    if event.get("type") == EventType.FULL_SNAPSHOT:
                        next_fs_node = event.get("data", {}).get("node")
                        break

            sim = simulate_backend_node_map(click_session["events"], next_fs_node)
            if click["node_id"] in sim["node_map"]:
                backend_status = "[green]PASS[/green]"
            else:
                backend_status = "[red]DROP[/red]"

        tag = f"<{resolution['tag']}>" if resolution["tag"] else "-"
        text = " ".join(resolution["text"])[:25] if resolution["text"] else "-"
        sel = (resolution["selector"] or "-")[:50]
        found = resolution["found_in"] or "[red]NOT FOUND[/red]"

        table.add_row(
            str(i),
            fmt_relative(click["timestamp"], base_ts),
            str(click["node_id"]),
            str(click["checkout_id"]),
            tag,
            text,
            sel,
            found,
            backend_status,
        )

    console.print(table)


def print_session_overview(sessions: list[dict[str, Any]]) -> None:
    print_header("SESSION OVERVIEW")

    table = Table(show_header=True)
    table.add_column("Session", style="cyan", justify="right")
    table.add_column("CID", style="dim", justify="right")
    table.add_column("Events", justify="right")
    table.add_column("FullSnaps", justify="right", style="magenta")
    table.add_column("Clicks", justify="right", style="yellow")
    table.add_column("META href", max_width=60)

    for session in sessions:
        events = session["events"]
        cid = str(session["checkout_id"]) if session["checkout_id"] is not None else "-"
        fs_count = sum(1 for e in events if e.get("type") == EventType.FULL_SNAPSHOT)
        click_count = sum(
            1 for e in events
            if e.get("type") == EventType.INCREMENTAL_SNAPSHOT
            and e.get("data", {}).get("source") == IncrementalSource.MOUSE_INTERACTION
            and e.get("data", {}).get("type") == 2
        )
        meta_href = "-"
        for e in events:
            if e.get("type") == EventType.META:
                meta_href = e.get("data", {}).get("href", "-")

        table.add_row(
            str(session["index"]),
            cid,
            str(len(events)),
            str(fs_count),
            str(click_count),
            meta_href[:57] + "..." if len(meta_href) > 57 else meta_href,
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
    args = parser.parse_args()

    try:
        print_header("CONFIRM BOOKING CLICK ANALYSIS")
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

        # --- Session grouping ---
        sessions = group_events_by_sessions(events)
        print_session_overview(sessions)

        # --- Key event extraction ---
        clicks = find_click_events(events)
        snapshots = find_full_snapshots(events)

        vr = ValidationResult()

        # --- Phase 1: Raw Click Inventory ---
        print_raw_click_inventory(clicks, base_ts)

        # --- Phase 2: Identify Confirm Booking Click ---
        confirm_click = print_confirm_click_identification(
            clicks, events, snapshots, base_ts, vr,
        )

        if confirm_click:
            # --- Phase 3: Element Resolution ---
            print_element_resolution(confirm_click, events, snapshots, vr)

            # --- Phase 4: Backend Simulation ---
            print_backend_simulation(confirm_click, sessions, vr)

            # --- Phase 5: Filter Analysis ---
            print_filter_analysis(confirm_click, sessions, events, snapshots, vr)

        # --- Phase 6: All Clicks Summary ---
        print_all_clicks_summary(clicks, events, snapshots, sessions, base_ts)

        # --- Final Report ---
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
