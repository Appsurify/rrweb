"""Analyze the TestMap Early Access multi-page navigation report.

Validates that the testmapsite.spec.cy.ts test report meets expectations:
  1. Event timeline — chronological table of all events
  2. Page count — exactly 2 pages (main + early-access)
  3. Snapshot count — 2-3 FullSnapshots total, each session has META+FS
  4. Session structure — checkoutId patterns, monotonic ordering
  5. Interaction binding — "Sign up for Early Access" click bound to page 1
  6. Element resolution — clicked node exists in same-session FullSnapshot
  7. Backend simulation — click target survives look-ahead & heuristic filters
  8. Cross-page isolation — clicked element's selector NOT in early-access FS
  9. Session summary — per-session overview table
 10. Backend conversion emulation — full pipeline: elements, actions, pages
 11. Final report — pass/fail/warning counts

Usage:
    python scripts/analyze_testmap.py [--file PATH]
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
    / "testmapsite.spec.cy.ts"
    / "chrome"
    / "TestMap-Early-Access-signup-clicks-the-Sign-up-for-Early-Access-button.json"
)

EXPECTED_PAGES = 2
EXPECTED_FS_MIN = 2
EXPECTED_FS_MAX = 3

# Expected hrefs (substring matching)
MAIN_PAGE_HREF = "testmap.io"
EARLY_ACCESS_HREF = "early-access"


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


class NodeType:
    DOCUMENT = 0
    DOCUMENT_TYPE = 1
    ELEMENT = 2
    TEXT = 3
    CDATA = 4
    COMMENT = 5


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
# Backend emulation helpers
# =============================================================================

def _build_fs_index(events: list[dict]) -> tuple[set[str], dict[str, bool]]:
    """Build FullSnapshot index for look-ahead (mirrors backend build_fullsnapshot_index)."""
    for event in events:
        if event.get("type") == EventType.FULL_SNAPSHOT:
            node = event.get("data", {}).get("node")
            if node:
                selectors: set[str] = set()
                visibility: dict[str, bool] = {}
                def walk(n: dict) -> None:
                    if n.get("type") == NodeType.ELEMENT and n.get("selector"):
                        selectors.add(n["selector"])
                        if n.get("isVisible") is not None:
                            visibility[n["selector"]] = n["isVisible"]
                    for child in n.get("childNodes", []) or []:
                        walk(child)
                walk(node)
                return selectors, visibility
    return set(), {}


def _collect_elements_flat(node: dict) -> list[dict]:
    """Collect all ELEMENT nodes from DOM tree (mirrors backend collect_nodes)."""
    elements: list[dict] = []
    def walk(n: dict) -> None:
        if n.get("type") == NodeType.ELEMENT:
            elements.append({
                "id": n.get("id"),
                "tag": n.get("tagName", ""),
                "selector": n.get("selector", ""),
                "is_visible": n.get("isVisible"),
                "is_interactive": n.get("isInteractive"),
                "source": "FULL_SNAPSHOT",
            })
        for child in n.get("childNodes", []) or []:
            walk(child)
    walk(node)
    return elements


def _build_id_to_selector_map(node: dict) -> dict[int, str]:
    """Build {node_id: selector} from DOM tree (mirrors backend _build_id_selector_map)."""
    result: dict[int, str] = {}
    def walk(n: dict) -> None:
        nid = n.get("id")
        sel = n.get("selector")
        if isinstance(nid, int) and sel and nid not in result:
            result[nid] = sel
        for child in n.get("childNodes", []) or []:
            walk(child)
    walk(node)
    return result


def _emulate_snapshot(
    events: list[dict],
    next_selectors: set[str] | None = None,
    next_visibility: dict[str, bool] | None = None,
) -> dict[str, Any]:
    """Emulate backend create_snapshot for one session's events."""
    # 1. META
    meta = None
    for e in events:
        if e.get("type") == EventType.META:
            meta = e.get("data", {})
            break

    # 2. FullSnapshot
    fs_node = None
    for e in events:
        if e.get("type") == EventType.FULL_SNAPSHOT:
            fs_node = e.get("data", {}).get("node")
            break

    # 3. Elements from FS
    elements = _collect_elements_flat(fs_node) if fs_node else []
    existing_ids = {e["id"] for e in elements}

    # 4. id_to_selector map for visibility look-ahead
    id_to_selector = _build_id_to_selector_map(fs_node) if fs_node else {}

    # 5. Visibility map (like backend lines 245-290)
    total_events = len(events)
    visibility_map: dict[int, bool] = {}
    for event_idx, e in enumerate(events):
        if e.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = e.get("data", {})
        if data.get("source") != IncrementalSource.VISIBILITY:
            continue
        for mutation in data.get("mutations", []) or []:
            vid = mutation.get("id")
            if not isinstance(vid, int) or mutation.get("isVisible") is not True:
                continue
            if next_visibility is not None:
                el_sel = id_to_selector.get(vid)
                if el_sel and next_visibility.get(el_sel) is True:
                    continue
            else:
                events_after = total_events - event_idx - 1
                position_pct = (event_idx / total_events * 100) if total_events > 0 else 0
                if position_pct >= 50 and events_after <= 3:
                    continue
            visibility_map[vid] = True

    # 6. MUTATION.adds with look-ahead (like backend lines 306-397)
    mutation_adds_total = 0
    filtered_lookahead = 0
    filtered_heuristic = 0
    for event_idx, e in enumerate(events):
        if e.get("type") != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = e.get("data", {})
        if data.get("source") != IncrementalSource.MUTATION:
            continue
        for add in data.get("adds", []) or []:
            node_data = add.get("node")
            if not node_data or node_data.get("type") != NodeType.ELEMENT:
                continue
            mutation_adds_total += 1
            # Look-ahead filter
            if next_selectors is not None:
                if node_data.get("selector") and node_data["selector"] in next_selectors:
                    filtered_lookahead += 1
                    continue
            else:
                events_after = total_events - event_idx - 1
                position_pct = (event_idx / total_events * 100) if total_events > 0 else 0
                if position_pct >= 50 and events_after <= 3:
                    filtered_heuristic += 1
                    continue
            # Visibility from MUTATION.adds
            if node_data.get("isVisible") is True and isinstance(node_data.get("id"), int):
                visibility_map[node_data["id"]] = True
            # Skip if already from FS
            if node_data.get("id") in existing_ids:
                continue
            elements.append({
                "id": node_data.get("id"),
                "tag": node_data.get("tagName", ""),
                "selector": node_data.get("selector", ""),
                "is_visible": node_data.get("isVisible"),
                "is_interactive": node_data.get("isInteractive"),
                "source": "MUTATION.adds",
            })
            existing_ids.add(node_data.get("id"))

    # 7. Apply visibility
    for el in elements:
        if not el.get("is_visible") and visibility_map.get(el["id"]) is True:
            el["is_visible"] = True

    # 8. Build node_map
    node_map = {int(el["id"]): el for el in elements if isinstance(el["id"], int)}

    # 9. Collect user actions (like backend collectors.py)
    actions: list[dict] = []
    for e in events:
        if e.get("type") == EventType.INCREMENTAL_SNAPSHOT:
            data = e.get("data", {})
            source = data.get("source")
            if source == IncrementalSource.MOUSE_INTERACTION:
                node_id = data.get("id")
                node = node_map.get(node_id)
                itype = data.get("type")
                action_name = {0: "mouse_up", 1: "mouse_down", 2: "click", 3: "context_menu",
                               4: "dbl_click", 5: "focus", 6: "blur"}.get(itype)
                actions.append({"kind": "USER", "action": action_name or f"mouse_{itype}",
                                "element_id": node_id, "linked": node is not None})
            elif source == IncrementalSource.INPUT:
                node_id = data.get("id")
                node = node_map.get(node_id)
                actions.append({"kind": "USER", "action": "input",
                                "element_id": node_id, "linked": node is not None})
            elif source == IncrementalSource.SCROLL:
                node_id = data.get("id")
                node = node_map.get(node_id)
                if node:
                    actions.append({"kind": "USER", "action": "scroll",
                                    "element_id": node_id, "linked": True})
        elif e.get("type") == EventType.CUSTOM:
            payload = e.get("data", {}).get("payload", {})
            elem_id = (payload.get("element") or {}).get("id")
            actions.append({"kind": "TEST", "action": payload.get("name") or "custom",
                            "element_id": elem_id, "linked": bool(node_map.get(elem_id))})

    # 10. Mark interacted + force visibility/interactivity
    interacted_ids = {a["element_id"] for a in actions if a.get("kind") == "USER" and a.get("linked")}
    for el in elements:
        el["is_interacted"] = el["id"] in interacted_ids
        if el["is_interacted"]:
            el["is_visible"] = True
            el["is_interactive"] = True

    # 11. Stats
    return {
        "meta": meta,
        "href": meta.get("href", "") if meta else "",
        "elements": elements,
        "node_map": node_map,
        "actions": actions,
        "stats": {
            "total_elements": len(elements),
            "visible": sum(1 for e in elements if e.get("is_visible")),
            "interactive": sum(1 for e in elements if e.get("is_interactive")),
            "interacted": sum(1 for e in elements if e.get("is_interacted")),
            "mutation_adds": mutation_adds_total,
            "filtered_lookahead": filtered_lookahead,
            "filtered_heuristic": filtered_heuristic,
        },
    }


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


def build_event_to_session_map(
    events: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
) -> dict[int, int]:
    """Map each event's flat-array index → session index.

    This avoids raw checkoutId comparisons which break when cid resets
    across page navigations (e.g. cid=1 on page A, then cid=1 again on page B).
    """
    event_to_session: dict[int, int] = {}
    flat_idx = 0
    for session in sessions:
        for _ in session["events"]:
            event_to_session[flat_idx] = session["index"]
            flat_idx += 1
    return event_to_session


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
# Event extraction
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


def find_meta_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find all META events."""
    metas = []
    for i, event in enumerate(events):
        if event.get("type") == EventType.META:
            metas.append({
                "event_index": i,
                "timestamp": event.get("timestamp", 0),
                "href": event.get("data", {}).get("href", ""),
                "checkout_id": event.get("checkoutId"),
            })
    return metas


def resolve_node_for_click(
    click: dict[str, Any],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    event_to_session: dict[int, int] | None = None,
) -> dict[str, Any]:
    """Resolve the DOM node for a click event.

    Searches the nearest preceding FullSnapshot, then MUTATION.adds.
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

    # Search MUTATION.adds after the click (same session)
    click_session_idx = event_to_session.get(click_idx) if event_to_session else None
    for i in range(click_idx + 1, len(events)):
        event = events[i]
        if event_to_session and event_to_session.get(i) != click_session_idx:
            break
        elif not event_to_session and event.get("checkoutId") != click["checkout_id"]:
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

    Returns dict with node_map, mutation_adds, filtered counts.
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
            if add_info["position_pct"] >= 50 and add_info["events_after"] <= 3:
                add_info["filtered_reason"] = "heuristic"
                filtered_by_heuristic.append(add_info)
                continue

            # Element passes both filters
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


# --- Phase 1: Event Timeline ---

def print_event_timeline(
    events: list[dict[str, Any]],
    base_ts: int,
) -> None:
    print_header("1. EVENT TIMELINE")

    table = Table(show_header=True, show_lines=False)
    table.add_column("#", style="dim", justify="right", width=5)
    table.add_column("Rel", style="dim", width=12)
    table.add_column("Type", width=18)
    table.add_column("Source", width=18)
    table.add_column("CID", justify="right", width=4)
    table.add_column("Details", max_width=60)

    for i, event in enumerate(events):
        etype = event.get("type")
        type_name = EVENT_TYPE_NAMES.get(etype, f"Unknown({etype})")
        ts = event.get("timestamp", 0)
        cid = str(event.get("checkoutId", "")) if "checkoutId" in event else "-"
        data = event.get("data", {})

        source_name = ""
        details = ""

        if etype == EventType.INCREMENTAL_SNAPSHOT:
            src = data.get("source")
            source_name = SOURCE_NAMES.get(src, f"Unknown({src})")

            if src == IncrementalSource.MOUSE_INTERACTION:
                mtype = data.get("type")
                mname = MOUSE_INTERACTION_NAMES.get(mtype, f"?({mtype})")
                nid = data.get("id", "")
                details = f"{mname} node={nid}"
            elif src == IncrementalSource.MUTATION:
                adds = len(data.get("adds", []) or [])
                removes = len(data.get("removes", []) or [])
                texts = len(data.get("texts", []) or [])
                attrs = len(data.get("attributes", []) or [])
                details = f"adds={adds} removes={removes} texts={texts} attrs={attrs}"
            elif src == IncrementalSource.SCROLL:
                details = f"id={data.get('id', '')} x={data.get('x', '')} y={data.get('y', '')}"
            elif src == IncrementalSource.VIEWPORT_RESIZE:
                details = f"{data.get('width', '')}x{data.get('height', '')}"
        elif etype == EventType.META:
            details = data.get("href", "")[:60]
        elif etype == EventType.FULL_SNAPSHOT:
            node = data.get("node", {})
            details = f"root type={node.get('type', '')} children={len(node.get('childNodes', []) or [])}"

        table.add_row(
            str(i),
            fmt_relative(ts, base_ts),
            type_name,
            source_name,
            cid,
            details,
        )

    console.print(table)
    console.print(f"\n  Total events: [bold]{len(events)}[/bold]")


# --- Phase 2: Page Count ---

def validate_page_count(
    metas: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("2. PAGE COUNT")

    hrefs = [m["href"] for m in metas]
    unique_hrefs = list(dict.fromkeys(hrefs))  # preserve order, deduplicate

    console.print(f"  META events: {len(metas)}")
    for i, m in enumerate(metas):
        console.print(f"    [{i}] event#{m['event_index']}  cid={m.get('checkout_id', '-')}  href={m['href']}")

    console.print(f"\n  Unique hrefs: {len(unique_hrefs)}")
    for href in unique_hrefs:
        console.print(f"    {href}")

    # Validate exactly 2 pages
    if len(unique_hrefs) == EXPECTED_PAGES:
        vr.add_pass(f"Exactly {EXPECTED_PAGES} distinct pages found")
    elif len(unique_hrefs) < EXPECTED_PAGES:
        vr.add_failure(f"Expected {EXPECTED_PAGES} pages, found {len(unique_hrefs)}")
    else:
        vr.add_warning(f"Expected {EXPECTED_PAGES} pages, found {len(unique_hrefs)}")

    # Validate expected page URLs
    has_main = any(MAIN_PAGE_HREF in h for h in unique_hrefs)
    has_early_access = any(EARLY_ACCESS_HREF in h for h in unique_hrefs)

    if has_main:
        vr.add_pass(f"Main page href contains '{MAIN_PAGE_HREF}'")
    else:
        vr.add_failure(f"No href contains '{MAIN_PAGE_HREF}'")

    if has_early_access:
        vr.add_pass(f"Early-access page href contains '{EARLY_ACCESS_HREF}'")
    else:
        vr.add_failure(f"No href contains '{EARLY_ACCESS_HREF}'")


# --- Phase 3: Snapshot Count ---

def validate_snapshot_count(
    snapshots: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("3. SNAPSHOT COUNT")

    console.print(f"  Total FullSnapshots: [bold]{len(snapshots)}[/bold]")
    for i, snap in enumerate(snapshots):
        console.print(
            f"    [{i}] event#{snap['event_index']}  "
            f"cid={snap.get('checkout_id', '-')}  "
            f"timestamp={fmt_ts(snap['timestamp'])}"
        )

    # Validate total count
    if EXPECTED_FS_MIN <= len(snapshots) <= EXPECTED_FS_MAX:
        vr.add_pass(f"FullSnapshot count ({len(snapshots)}) within expected range [{EXPECTED_FS_MIN}, {EXPECTED_FS_MAX}]")
    else:
        vr.add_failure(
            f"FullSnapshot count ({len(snapshots)}) outside expected range "
            f"[{EXPECTED_FS_MIN}, {EXPECTED_FS_MAX}]"
        )

    # Verify each session has META + FullSnapshot
    console.print()
    for session in sessions:
        events = session["events"]
        has_meta = any(e.get("type") == EventType.META for e in events)
        has_fs = any(e.get("type") == EventType.FULL_SNAPSHOT for e in events)
        cid = session["checkout_id"]
        idx = session["index"]

        if has_meta and has_fs:
            vr.add_pass(f"Session {idx} (cid={cid}): has META + FullSnapshot")
            console.print(f"  Session {idx} (cid={cid}): [green]META + FS[/green]")
        elif has_meta:
            vr.add_warning(f"Session {idx} (cid={cid}): has META but no FullSnapshot")
            console.print(f"  Session {idx} (cid={cid}): [yellow]META only[/yellow]")
        elif has_fs:
            vr.add_warning(f"Session {idx} (cid={cid}): has FullSnapshot but no META")
            console.print(f"  Session {idx} (cid={cid}): [yellow]FS only[/yellow]")
        else:
            # Threshold checkout sessions may lack both — just a warning
            vr.add_warning(f"Session {idx} (cid={cid}): no META or FullSnapshot (threshold checkout?)")
            console.print(f"  Session {idx} (cid={cid}): [dim]no META or FS[/dim]")


# --- Phase 4: Session Structure ---

def validate_session_structure(
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
) -> None:
    print_header("4. SESSION STRUCTURE")

    cids = [s["checkout_id"] for s in sessions if s["checkout_id"] is not None]
    console.print(f"  Sessions: {len(sessions)}")
    console.print(f"  checkoutIds: {cids}")

    if not cids:
        vr.add_warning("No checkoutId found in events")
        return

    # Monotonic check
    is_monotonic = all(cids[i] < cids[i + 1] for i in range(len(cids) - 1))
    if is_monotonic:
        vr.add_pass(f"checkoutId monotonically increasing: {cids[0]}..{cids[-1]}")
        console.print(f"  [green]Monotonic: YES[/green]  {cids[0]} -> {cids[-1]}")
    else:
        vr.add_warning(f"checkoutId NOT monotonic: {cids} (may include threshold checkouts)")
        console.print(f"  [yellow]Monotonic: NO[/yellow]  {cids}")

    # Check consistency within sessions
    for s in sessions:
        session_cids = set(e.get("checkoutId") for e in s["events"] if "checkoutId" in e)
        if len(session_cids) > 1:
            vr.add_failure(f"Session {s['index']}: mixed checkoutIds {session_cids}")


# --- Phase 5: Interaction Binding ---

def validate_interaction_binding(
    clicks: list[dict[str, Any]],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    metas: list[dict[str, Any]],
    base_ts: int,
    vr: ValidationResult,
    event_to_session: dict[int, int] | None = None,
) -> tuple[dict[str, Any] | None, int | None]:
    """Find the "Sign up for Early Access" click and verify it's bound to page 1."""
    print_header("5. INTERACTION BINDING")

    target_click = None
    target_resolution = None

    for click in clicks:
        resolution = resolve_node_for_click(click, events, snapshots, event_to_session)
        text = " ".join(resolution["text"]).lower()
        if "sign up" in text and "early access" in text:
            target_click = click
            target_resolution = resolution
            break

    # Fallback: try matching by selector or partial text
    if not target_click:
        for click in clicks:
            resolution = resolve_node_for_click(click, events, snapshots, event_to_session)
            text = " ".join(resolution["text"]).lower()
            if "early access" in text or "sign up" in text:
                target_click = click
                target_resolution = resolution
                break

    if not target_click:
        console.print("  [bold red]'Sign up for Early Access' click NOT FOUND![/bold red]")
        console.print("  Checked all click events by resolving target node text.")
        vr.add_failure("'Sign up for Early Access' click not found in raw events")
        return None, None

    console.print(f"  [bold green]FOUND[/bold green] 'Sign up for Early Access' click:")
    console.print(f"    Event index:    {target_click['event_index']}")
    console.print(f"    Timestamp:      {fmt_ts(target_click['timestamp'])} ({fmt_relative(target_click['timestamp'], base_ts)})")
    console.print(f"    Node ID:        {target_click['node_id']}")
    console.print(f"    Coordinates:    ({target_click['x']}, {target_click['y']})")
    console.print(f"    checkoutId:     {target_click['checkout_id']}")
    console.print(f"    Click selector: {target_click['selector'] or '(empty)'}")
    console.print()
    console.print(f"    Resolved element:")
    console.print(f"      Found in:   {target_resolution['found_in']}")
    console.print(f"      Tag:        <{target_resolution['tag']}>")
    console.print(f"      Selector:   {target_resolution['selector']}")
    console.print(f"      Text:       {target_resolution['text']}")

    vr.add_pass(
        f"'Sign up for Early Access' click exists (event[{target_click['event_index']}], "
        f"node_id={target_click['node_id']})"
    )

    # Verify it's bound to the main page session (not early-access)
    click_session_idx = event_to_session.get(target_click["event_index"]) if event_to_session else None
    click_session = sessions[click_session_idx] if click_session_idx is not None else None

    if click_session:
        # Find META href for this session
        session_href = None
        for e in click_session["events"]:
            if e.get("type") == EventType.META:
                session_href = e.get("data", {}).get("href", "")
                break

        console.print()
        console.print(f"    Session href: {session_href or '(none)'}")

        if session_href and EARLY_ACCESS_HREF not in session_href:
            vr.add_pass(f"Click bound to main page session (href: {session_href})")
            console.print(f"    [green]Correctly bound to main page (not early-access)[/green]")
        elif session_href and EARLY_ACCESS_HREF in session_href:
            vr.add_failure(f"Click incorrectly bound to early-access session (href: {session_href})")
            console.print(f"    [red]INCORRECTLY bound to early-access page![/red]")
        else:
            vr.add_warning("Could not determine session href for click binding validation")

    return target_click, click_session_idx


# --- Phase 6: Element Resolution ---

def validate_element_resolution(
    target_click: dict[str, Any],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    vr: ValidationResult,
    event_to_session: dict[int, int] | None = None,
    click_session_idx: int | None = None,
) -> None:
    print_header("6. ELEMENT RESOLUTION")

    node_id = target_click["node_id"]
    console.print(f"  Target node_id: {node_id}")
    console.print(f"  Click session index: {click_session_idx}")
    console.print()

    # Search ALL FullSnapshots
    console.print("  [bold]Search in FullSnapshots:[/bold]")
    found_in_same_session_fs = False
    found_in_any_fs = False

    for snap in snapshots:
        if snap["node"]:
            node = find_node_by_id(snap["node"], node_id)
            if node:
                found_in_any_fs = True
                same_session = (
                    event_to_session.get(snap["event_index"]) == click_session_idx
                    if event_to_session and click_session_idx is not None
                    else snap["checkout_id"] == target_click["checkout_id"]
                )
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

    # Search MUTATION.adds
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
                same_session = (
                    event_to_session.get(i) == click_session_idx
                    if event_to_session and click_session_idx is not None
                    else event.get("checkoutId") == target_click["checkout_id"]
                )
                marker = "[green]SAME SESSION[/green]" if same_session else "[dim]different session[/dim]"
                console.print(
                    f"    [green]FOUND[/green] in MUTATION.adds[{i}] "
                    f"(cid={event.get('checkoutId')}) {marker}"
                )
                console.print(f"      tag=<{node.get('tagName', '')}>  selector={node.get('selector', '')}")

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


# --- Phase 7: Backend Simulation ---

def validate_backend_simulation(
    target_click: dict[str, Any],
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
    click_session_idx: int | None = None,
) -> None:
    print_header("7. BACKEND SIMULATION")

    node_id = target_click["node_id"]

    if click_session_idx is None or click_session_idx >= len(sessions):
        console.print(f"  [bold red]Session index {click_session_idx} not found![/bold red]")
        vr.add_failure(f"Could not find session for click (session_idx={click_session_idx})")
        return

    click_session = sessions[click_session_idx]

    # Find next session's FullSnapshot (for look-ahead filter)
    next_fs_node = None
    if click_session_idx is not None and click_session_idx + 1 < len(sessions):
        next_session = sessions[click_session_idx + 1]
        for event in next_session["events"]:
            if event.get("type") == EventType.FULL_SNAPSHOT:
                next_fs_node = event.get("data", {}).get("node")
                break

    console.print(f"  Session: {click_session_idx} (checkoutId={click_session.get('checkout_id')})")
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


# --- Phase 8: Cross-Page Isolation ---

def validate_cross_page_isolation(
    target_click: dict[str, Any],
    events: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    sessions: list[dict[str, Any]],
    vr: ValidationResult,
    click_session_idx: int | None = None,
    event_to_session: dict[int, int] | None = None,
) -> None:
    print_header("8. CROSS-PAGE ISOLATION")

    # Resolve the clicked element's selector
    resolution = resolve_node_for_click(target_click, events, snapshots, event_to_session)
    element_selector = resolution.get("selector", "")

    console.print(f"  Clicked element selector: {element_selector or '(empty)'}")

    if not element_selector:
        vr.add_warning("No selector on clicked element — cannot check cross-page isolation")
        return

    # Find the early-access session's FullSnapshot
    early_access_fs_node = None
    early_access_session_idx = None
    for session in sessions:
        if session["index"] == click_session_idx:
            continue  # Skip the click's own session
        for event in session["events"]:
            if event.get("type") == EventType.META:
                href = event.get("data", {}).get("href", "")
                if EARLY_ACCESS_HREF in href:
                    early_access_session_idx = session["index"]
                    # Find its FullSnapshot
                    for fs_event in session["events"]:
                        if fs_event.get("type") == EventType.FULL_SNAPSHOT:
                            early_access_fs_node = fs_event.get("data", {}).get("node")
                            break
                    break
        if early_access_fs_node:
            break

    if not early_access_fs_node:
        vr.add_warning("No early-access FullSnapshot found — cannot check cross-page isolation")
        console.print("  [yellow]No early-access FullSnapshot found[/yellow]")
        return

    console.print(f"  Early-access session: {early_access_session_idx}")

    # Check if the clicked element's selector appears in the early-access FS
    ea_selectors = collect_all_selectors(early_access_fs_node)
    console.print(f"  Early-access FS selectors: {len(ea_selectors)} total")

    if element_selector in ea_selectors:
        vr.add_warning(
            f"Clicked element's selector '{element_selector}' FOUND in early-access FS "
            f"(cross-page overlap — look-ahead filter would apply)"
        )
        console.print(f"  [yellow]Selector FOUND in early-access FS (overlap)[/yellow]")
    else:
        vr.add_pass(f"Clicked element's selector NOT in early-access FS (proper isolation)")
        console.print(f"  [green]Selector NOT in early-access FS (properly isolated)[/green]")


# --- Phase 9: Session Summary ---

def print_session_summary(sessions: list[dict[str, Any]]) -> None:
    print_header("9. SESSION SUMMARY")

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


# --- Phase 10: Backend Conversion Emulation ---

def validate_backend_conversion(
    events: list[dict],
    sessions: list[dict],
    target_click: dict | None,
    click_session_idx: int | None,
    vr: ValidationResult,
) -> None:
    """Phase 10: Emulate backend conversion pipeline."""
    print_header("10. BACKEND CONVERSION EMULATION")

    # --- Pass 1: Build FS indexes for all sessions (look-ahead) ---
    console.print("  [bold]Pass 1: Build FullSnapshot indexes[/bold]")
    fs_indexes: list[tuple[set[str], dict[str, bool]]] = []
    for session in sessions:
        selectors, visibility = _build_fs_index(session["events"])
        fs_indexes.append((selectors, visibility))
        console.print(
            f"    Session {session['index']}: "
            f"{len(selectors)} selectors, {sum(1 for v in visibility.values() if v)} visible"
        )

    # --- Pass 2: Process each session with look-ahead ---
    console.print()
    console.print("  [bold]Pass 2: Process sessions[/bold]")
    snapshot_results: list[dict[str, Any]] = []
    for i, session in enumerate(sessions):
        # Look-ahead: use next session's FS index
        if i + 1 < len(sessions):
            next_sel, next_vis = fs_indexes[i + 1]
        else:
            next_sel, next_vis = None, None
        result = _emulate_snapshot(session["events"], next_sel, next_vis)
        result["session_idx"] = session["index"]
        snapshot_results.append(result)

    # --- Merge into pages by href ---
    console.print()
    console.print("  [bold]Page merging (by href)[/bold]")
    pages: dict[str, list[dict[str, Any]]] = {}
    for sr in snapshot_results:
        href = sr["href"]
        if href not in pages:
            pages[href] = []
        pages[href].append(sr)

    # --- Pages table ---
    console.print()
    page_table = Table(show_header=True, title="Pages")
    page_table.add_column("#", style="dim", justify="right", width=3)
    page_table.add_column("Href", max_width=55)
    page_table.add_column("Snapshots", justify="right")
    page_table.add_column("Elements", justify="right")
    page_table.add_column("Visible", justify="right", style="green")
    page_table.add_column("Interactive", justify="right", style="cyan")
    page_table.add_column("Interacted", justify="right", style="yellow")

    for pidx, (href, snapshots_in_page) in enumerate(pages.items()):
        total_el = sum(s["stats"]["total_elements"] for s in snapshots_in_page)
        total_vis = sum(s["stats"]["visible"] for s in snapshots_in_page)
        total_int = sum(s["stats"]["interactive"] for s in snapshots_in_page)
        total_act = sum(s["stats"]["interacted"] for s in snapshots_in_page)
        display_href = href[:52] + "..." if len(href) > 52 else href
        page_table.add_row(
            str(pidx), display_href, str(len(snapshots_in_page)),
            str(total_el), str(total_vis), str(total_int), str(total_act),
        )
    console.print(page_table)

    # --- Snapshots table ---
    console.print()
    snap_table = Table(show_header=True, title="Snapshots")
    snap_table.add_column("Session", style="cyan", justify="right", width=7)
    snap_table.add_column("Href", max_width=40)
    snap_table.add_column("Elements", justify="right")
    snap_table.add_column("NodeMap", justify="right")
    snap_table.add_column("Mut.adds", justify="right")
    snap_table.add_column("Filt(LA)", justify="right", style="dim")
    snap_table.add_column("Filt(H)", justify="right", style="dim")
    snap_table.add_column("Actions", justify="right")
    snap_table.add_column("Linked", justify="right", style="green")
    snap_table.add_column("Unlinked", justify="right", style="red")

    for sr in snapshot_results:
        s = sr["stats"]
        linked = sum(1 for a in sr["actions"] if a.get("linked"))
        unlinked = sum(1 for a in sr["actions"] if not a.get("linked"))
        display_href = sr["href"][-37:] if len(sr["href"]) > 37 else sr["href"]
        snap_table.add_row(
            str(sr["session_idx"]),
            display_href,
            str(s["total_elements"]),
            str(len(sr["node_map"])),
            str(s["mutation_adds"]),
            str(s["filtered_lookahead"]),
            str(s["filtered_heuristic"]),
            str(len(sr["actions"])),
            str(linked),
            str(unlinked),
        )
    console.print(snap_table)

    # --- Verify target click ---
    console.print()
    if target_click is not None and click_session_idx is not None:
        node_id = target_click["node_id"]
        console.print(f"  [bold]Target click verification (node {node_id}, session {click_session_idx})[/bold]")

        # Find snapshot result for click session
        click_sr = None
        for sr in snapshot_results:
            if sr["session_idx"] == click_session_idx:
                click_sr = sr
                break

        if click_sr:
            in_node_map = node_id in click_sr["node_map"]
            click_action_linked = any(
                a.get("action") == "click" and a.get("element_id") == node_id and a.get("linked")
                for a in click_sr["actions"]
            )
            el = click_sr["node_map"].get(node_id)

            if in_node_map:
                console.print(f"    [green]Node {node_id} IS in node_map[/green]")
                console.print(f"      tag=<{el['tag']}>  selector={el['selector']}")
                console.print(f"      is_visible={el.get('is_visible')}  "
                              f"is_interactive={el.get('is_interactive')}  "
                              f"is_interacted={el.get('is_interacted')}")
                vr.add_pass(f"Backend emulation: node {node_id} in node_map")
            else:
                console.print(f"    [red]Node {node_id} NOT in node_map![/red]")
                vr.add_failure(f"Backend emulation: node {node_id} missing from node_map")

            if click_action_linked:
                console.print(f"    [green]Click action linked to node {node_id}[/green]")
                vr.add_pass(f"Backend emulation: click action linked to node {node_id}")
            else:
                console.print(f"    [red]Click action NOT linked to node {node_id}[/red]")
                vr.add_failure(f"Backend emulation: click action not linked to node {node_id}")
        else:
            console.print(f"    [red]No snapshot result for session {click_session_idx}[/red]")
            vr.add_failure(f"Backend emulation: no snapshot for session {click_session_idx}")
    else:
        console.print("  [dim]No target click to verify[/dim]")
        vr.add_warning("Backend emulation: no target click for verification")

    # --- Check for unlinked user actions across all snapshots ---
    total_unlinked = sum(
        1 for sr in snapshot_results
        for a in sr["actions"] if a.get("kind") == "USER" and not a.get("linked")
    )
    if total_unlinked == 0:
        vr.add_pass("Backend emulation: all user actions linked")
    else:
        vr.add_warning(f"Backend emulation: {total_unlinked} unlinked user action(s)")


# --- Phase 11: Final Report ---

def print_validation_report(vr: ValidationResult) -> None:
    print_header("11. FINAL REPORT")

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
        print_header("TESTMAP MULTI-PAGE NAVIGATION ANALYSIS")
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

        # --- Key event extraction ---
        sessions = group_events_by_sessions(events)
        event_to_session = build_event_to_session_map(events, sessions)
        clicks = find_click_events(events)
        snapshots = find_full_snapshots(events)
        metas = find_meta_events(events)

        vr = ValidationResult()

        # --- Phase 1: Event Timeline ---
        print_event_timeline(events, base_ts)

        # --- Phase 2: Page Count ---
        validate_page_count(metas, vr)

        # --- Phase 3: Snapshot Count ---
        validate_snapshot_count(snapshots, sessions, vr)

        # --- Phase 4: Session Structure ---
        validate_session_structure(sessions, vr)

        # --- Phase 5: Interaction Binding ---
        target_click, click_session_idx = validate_interaction_binding(
            clicks, events, snapshots, sessions, metas, base_ts, vr,
            event_to_session,
        )

        if target_click:
            # --- Phase 6: Element Resolution ---
            validate_element_resolution(
                target_click, events, snapshots, vr,
                event_to_session, click_session_idx,
            )

            # --- Phase 7: Backend Simulation ---
            validate_backend_simulation(target_click, sessions, vr, click_session_idx)

            # --- Phase 8: Cross-Page Isolation ---
            validate_cross_page_isolation(
                target_click, events, snapshots, sessions, vr,
                click_session_idx, event_to_session,
            )

        # --- Phase 9: Session Summary ---
        print_session_summary(sessions)

        # --- Phase 10: Backend Conversion Emulation ---
        validate_backend_conversion(events, sessions, target_click, click_session_idx, vr)

        # --- Phase 11: Final Report ---
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
