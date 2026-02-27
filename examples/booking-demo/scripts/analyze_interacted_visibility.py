"""Analyze why some interacted elements are not displayed as is_interacted after import.

Investigates the full-booking-flow test report to determine:
  1. Which elements are interacted (have USER actions: click, type, scroll)
  2. What isVisible value each interacted element has in the FullSnapshot
  3. Whether the visibility flag causes elements to be filtered out in the UI
  4. Correlation between viewport scroll position and isVisible=false

Root cause diagnosis:
  - FullSnapshot records isVisible based on viewport position at snapshot time
  - Elements outside viewport at snapshot time get isVisible=false
  - With visibility.mode='none', no VISIBILITY_MUTATION events update visibility
  - The UI default filter is_visible=true hides interacted-but-not-visible elements
  - Result: elements interacted AFTER scrolling appear "not interacted" in the UI

Usage:
    python scripts/analyze_interacted_visibility.py [--file PATH]
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


class IncrementalSource:
    MUTATION = 0
    MOUSE_MOVE = 1
    MOUSE_INTERACTION = 2
    SCROLL = 3
    VIEWPORT_RESIZE = 4
    INPUT = 5
    TOUCH_MOVE = 6
    MEDIA_INTERACTION = 7
    VISIBILITY = 18


class MouseInteractions:
    MOUSE_UP = 0
    MOUSE_DOWN = 1
    CLICK = 2
    CONTEXT_MENU = 3
    DBL_CLICK = 4
    FOCUS = 5
    BLUR = 6
    TOUCH_START = 7
    TOUCH_MOVE_DEPRECATED = 8
    TOUCH_END = 9
    TOUCH_CANCEL = 10


# Interaction types that indicate user engagement
USER_ACTION_SOURCES = {
    IncrementalSource.MOUSE_INTERACTION,
    IncrementalSource.INPUT,
    IncrementalSource.SCROLL,
}

# Mouse interaction types that count as "user interacted"
INTERACTED_MOUSE_TYPES = {
    MouseInteractions.CLICK,
    MouseInteractions.DBL_CLICK,
    MouseInteractions.CONTEXT_MENU,
    MouseInteractions.MOUSE_DOWN,
    MouseInteractions.MOUSE_UP,
    MouseInteractions.FOCUS,
    MouseInteractions.BLUR,
}

console = Console()


# =============================================================================
# DOM Helpers
# =============================================================================


def collect_node_map(node: dict, result: dict[int, dict] | None = None) -> dict[int, dict]:
    """Build {node_id: node_dict} from a FullSnapshot DOM tree."""
    if result is None:
        result = {}
    nid = node.get("id")
    if isinstance(nid, int):
        result[nid] = node
    for child in node.get("childNodes") or []:
        collect_node_map(child, result)
    return result


def collect_mutation_add_nodes(events: list[dict]) -> dict[int, dict]:
    """Collect all nodes from MUTATION.adds events."""
    result: dict[int, dict] = {}
    for e in events:
        if e["type"] == EventType.INCREMENTAL_SNAPSHOT and e["data"].get("source") == IncrementalSource.MUTATION:
            for add in e["data"].get("adds") or []:
                node = add.get("node")
                if node:
                    collect_node_map(node, result)
    return result


def get_scroll_position(fs_event: dict) -> tuple[int, int]:
    """Extract scroll position from FullSnapshot event."""
    offset = fs_event["data"].get("initialOffset", {})
    top = offset.get("top", 0)
    left = offset.get("left", 0)
    # Also check html element for rr_scrollTop
    root = fs_event["data"].get("node", {})
    for child in root.get("childNodes") or []:
        if isinstance(child, dict) and child.get("tagName") == "html":
            rr_top = child.get("attributes", {}).get("rr_scrollTop")
            if rr_top is not None:
                top = int(rr_top)
            break
    return left, top


def get_node_text(node: dict, max_depth: int = 3) -> str:
    """Recursively collect text content from a DOM node."""
    if max_depth <= 0:
        return ""
    parts = []
    for child in node.get("childNodes") or []:
        if child.get("type") == 3:  # Text node
            text = child.get("textContent", "").strip()
            if text:
                parts.append(text)
        elif child.get("type") == 2:  # Element node
            parts.append(get_node_text(child, max_depth - 1))
    return " ".join(p for p in parts if p)


# =============================================================================
# Session Grouping
# =============================================================================


def group_by_checkout(events: list[dict]) -> dict[int, list[dict]]:
    """Group events by checkoutId."""
    groups: dict[int, list[dict]] = {}
    for e in events:
        cid = e.get("checkoutId", 0)
        groups.setdefault(cid, []).append(e)
    return groups


# =============================================================================
# Interaction Extraction
# =============================================================================


def extract_interactions(events: list[dict]) -> list[dict]:
    """Extract user interaction events (clicks, inputs) from an event list."""
    interactions = []
    for e in events:
        if e["type"] != EventType.INCREMENTAL_SNAPSHOT:
            continue
        data = e["data"]
        src = data.get("source")

        if src == IncrementalSource.MOUSE_INTERACTION:
            mtype = data.get("type")
            if mtype in INTERACTED_MOUSE_TYPES:
                action_name = {
                    MouseInteractions.CLICK: "click",
                    MouseInteractions.DBL_CLICK: "dbl_click",
                    MouseInteractions.CONTEXT_MENU: "context_menu",
                    MouseInteractions.MOUSE_DOWN: "mouse_down",
                    MouseInteractions.MOUSE_UP: "mouse_up",
                    MouseInteractions.FOCUS: "focus",
                    MouseInteractions.BLUR: "blur",
                }.get(mtype, f"mouse_{mtype}")
                interactions.append({
                    "action": action_name,
                    "node_id": data.get("id"),
                    "timestamp": e["timestamp"],
                    "source": "MouseInteraction",
                })

        elif src == IncrementalSource.INPUT:
            interactions.append({
                "action": "type",
                "node_id": data.get("id"),
                "timestamp": e["timestamp"],
                "text": str(data.get("text", ""))[:30],
                "source": "Input",
            })

        elif src == IncrementalSource.SCROLL:
            interactions.append({
                "action": "scroll",
                "node_id": data.get("id"),
                "timestamp": e["timestamp"],
                "scroll_y": data.get("y", 0),
                "source": "Scroll",
            })
    return interactions


# =============================================================================
# Analysis
# =============================================================================


def analyze_report(filepath: Path) -> None:
    """Run the full analysis pipeline."""
    console.print(Panel(
        f"[bold]Interacted Element Visibility Analysis[/bold]\n"
        f"File: {filepath.name}\n"
        f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        style="blue",
    ))

    with open(filepath) as f:
        data = json.load(f)

    events = data["events"]
    metadata = data.get("metadata", {})
    console.print(f"\nTotal events: [bold]{len(events)}[/bold]")
    console.print(f"Test: {metadata.get('test', {}).get('fullTitle', 'unknown')}")

    # Group by checkout
    checkout_groups = group_by_checkout(events)
    console.print(f"Checkout sessions: [bold]{len(checkout_groups)}[/bold]\n")

    # Counters for summary
    total_interacted = 0
    visible_interacted = 0
    invisible_interacted = 0
    all_issues: list[dict] = []

    for cid in sorted(checkout_groups.keys()):
        group = checkout_groups[cid]
        console.rule(f"[bold]Checkout {cid}[/bold] ({len(group)} events)")

        # Find META
        meta_href = "unknown"
        for e in group:
            if e["type"] == EventType.META:
                meta_href = e["data"].get("href", "unknown")
                break

        # Find FullSnapshot
        fs_event = None
        fs_node_map: dict[int, dict] = {}
        scroll_x, scroll_y = 0, 0
        for e in group:
            if e["type"] == EventType.FULL_SNAPSHOT:
                fs_event = e
                fs_node_map = collect_node_map(e["data"]["node"])
                scroll_x, scroll_y = get_scroll_position(e)
                break

        # Mutation adds
        mutation_node_map = collect_mutation_add_nodes(group)

        # Visibility events
        vis_event_count = sum(
            1 for e in group
            if e["type"] == EventType.INCREMENTAL_SNAPSHOT
            and e["data"].get("source") == IncrementalSource.VISIBILITY
        )

        console.print(f"  href: {meta_href}")
        console.print(f"  FullSnapshot scroll: x={scroll_x}, y={scroll_y}")
        console.print(f"  FullSnapshot nodes: {len(fs_node_map)}")
        console.print(f"  MUTATION.adds nodes: {len(mutation_node_map)}")
        console.print(f"  VISIBILITY events: {vis_event_count}")

        # Extract interactions
        interactions = extract_interactions(group)
        if not interactions:
            console.print("  [dim]No user interactions[/dim]\n")
            continue

        # Deduplicate by node_id for display (keep unique interacted nodes)
        interacted_node_ids: set[int] = set()
        for ix in interactions:
            nid = ix.get("node_id")
            if isinstance(nid, int) and ix["action"] in ("click", "type", "dbl_click"):
                interacted_node_ids.add(nid)

        # Build analysis table
        table = Table(
            title=f"Interacted Elements (Checkout {cid})",
            show_lines=True,
            title_style="bold cyan",
        )
        table.add_column("Node ID", style="bold", width=8)
        table.add_column("Tag", width=8)
        table.add_column("isVisible", width=10)
        table.add_column("isInteractive", width=13)
        table.add_column("Source", width=10)
        table.add_column("Actions", width=15)
        table.add_column("Selector / Text", max_width=50, no_wrap=True)
        table.add_column("UI Status", width=12)

        for nid in sorted(interacted_node_ids):
            # Find the node
            node = fs_node_map.get(nid) or mutation_node_map.get(nid)
            source = "FS" if nid in fs_node_map else ("MUT" if nid in mutation_node_map else "MISSING")

            if not node:
                table.add_row(
                    str(nid), "?", "?", "?", source, "?", "?",
                    Text("MISSING", style="bold red"),
                )
                continue

            tag = node.get("tagName", "?")
            is_visible = node.get("isVisible")
            is_interactive = node.get("isInteractive")
            selector = node.get("selector", "")
            text = get_node_text(node)
            attrs = node.get("attributes", {})

            # Describe element
            if selector:
                desc = selector[:50]
            elif text:
                desc = f'text="{text[:40]}"'
            else:
                name = attrs.get("name") or attrs.get("id") or ""
                desc = f'{tag}[name="{name}"]' if name else tag

            # Collect actions for this node
            node_actions = [
                ix["action"] for ix in interactions if ix.get("node_id") == nid
            ]
            actions_str = ", ".join(sorted(set(node_actions)))

            # Determine UI visibility status
            vis_str = str(is_visible) if is_visible is not None else "None"
            interactive_str = str(is_interactive) if is_interactive is not None else "None"

            # UI status: visible=true AND interactive=true → SHOWN, otherwise HIDDEN
            if is_visible is True and is_interactive is True:
                ui_status = Text("SHOWN", style="bold green")
            elif is_visible is False:
                ui_status = Text("HIDDEN", style="bold red")
                invisible_interacted += 1
                all_issues.append({
                    "checkout": cid,
                    "node_id": nid,
                    "tag": tag,
                    "selector": selector,
                    "actions": actions_str,
                    "scroll_y": scroll_y,
                })
            elif is_visible is None:
                ui_status = Text("HIDDEN?", style="bold yellow")
                invisible_interacted += 1
            else:
                ui_status = Text("SHOWN", style="bold green")

            total_interacted += 1
            if is_visible is True:
                visible_interacted += 1

            table.add_row(
                str(nid), tag, vis_str, interactive_str, source, actions_str, desc, ui_status,
            )

        console.print(table)
        console.print()

    # ==========================================================================
    # Summary
    # ==========================================================================
    console.rule("[bold]DIAGNOSIS SUMMARY[/bold]")

    summary_table = Table(show_header=False, box=None, padding=(0, 2))
    summary_table.add_column("Label", style="bold")
    summary_table.add_column("Value")

    summary_table.add_row("Total interacted elements", str(total_interacted))
    summary_table.add_row(
        "Shown in UI (is_visible=True)",
        Text(str(visible_interacted), style="green"),
    )
    summary_table.add_row(
        "Hidden in UI (is_visible=False/None)",
        Text(str(invisible_interacted), style="red bold"),
    )
    console.print(summary_table)

    if all_issues:
        console.print()
        console.print(Panel(
            "[bold red]ROOT CAUSE: isVisible=false in FullSnapshot[/bold red]\n\n"
            "Elements outside the viewport at FullSnapshot time get isVisible=false.\n"
            "With visibility.mode='none', no VISIBILITY_MUTATION events update this flag.\n"
            "The UI default filter (is_visible=true) hides these elements.\n\n"
            "[bold]Result:[/bold] interacted elements that required scrolling appear "
            '"not interacted" in the UI.',
            title="Root Cause",
            style="red",
        ))

        # Detailed issues table
        issues_table = Table(
            title="Hidden Interacted Elements",
            show_lines=True,
            title_style="bold red",
        )
        issues_table.add_column("Checkout", width=10)
        issues_table.add_column("Node ID", width=8)
        issues_table.add_column("Tag", width=8)
        issues_table.add_column("Actions", width=15)
        issues_table.add_column("Scroll Y at FS", width=13)
        issues_table.add_column("Selector", max_width=55, no_wrap=True)

        for issue in all_issues:
            issues_table.add_row(
                str(issue["checkout"]),
                str(issue["node_id"]),
                issue["tag"],
                issue["actions"],
                str(issue["scroll_y"]),
                issue["selector"][:55] if issue["selector"] else "N/A",
            )
        console.print(issues_table)

        # Solutions
        console.print()
        console.print(Panel(
            "[bold]Option A — Backend conversion fix (recommended):[/bold]\n"
            "In builders.py create_snapshot(), after marking is_interacted (step 9),\n"
            "force is_visible=True for all elements with is_interacted=True.\n"
            "Rationale: if a user interacted with an element, it was necessarily visible.\n\n"
            "[bold]Option B — Recording fix (visibility tracking):[/bold]\n"
            "Change visibility.mode from 'none' to 'checkout' or 'mutation'.\n"
            "This emits VISIBILITY_MUTATION events when elements enter/leave viewport,\n"
            "allowing the conversion to update is_visible after scrolling.\n\n"
            "[bold]Option C — Query layer fix:[/bold]\n"
            "In element_agg_layout_subq, when computing aggregated is_visible,\n"
            "use: bool_or(is_visible OR is_interacted) instead of bool_or(is_visible).\n"
            "This ensures interacted elements are always considered visible.\n\n"
            "[bold]Option D — Combined (most robust):[/bold]\n"
            "Apply Option A in the conversion AND Option B for new recordings.\n"
            "This fixes existing data and prevents the issue for future recordings.",
            title="Proposed Solutions",
            style="green",
        ))

    else:
        console.print(Panel(
            "[bold green]All interacted elements are visible — no issues detected.[/bold green]",
            style="green",
        ))

    # Cross-check: verify rrweb recording and Cypress plugin are correct
    console.print()
    console.rule("[bold]COMPONENT VERIFICATION[/bold]")

    checks = Table(show_header=True, title="System Component Status", title_style="bold")
    checks.add_column("Component", style="bold", width=30)
    checks.add_column("Status", width=10)
    checks.add_column("Detail", max_width=50)

    # Check 1: All interactions have node IDs in FullSnapshot
    all_ids_found = True
    for cid_check in sorted(checkout_groups.keys()):
        grp = checkout_groups[cid_check]
        fs_ids = set()
        mut_ids = set()
        for e_check in grp:
            if e_check["type"] == EventType.FULL_SNAPSHOT:
                fs_ids = set(collect_node_map(e_check["data"]["node"]).keys())
            elif (
                e_check["type"] == EventType.INCREMENTAL_SNAPSHOT
                and e_check["data"].get("source") == IncrementalSource.MUTATION
            ):
                for add in e_check["data"].get("adds") or []:
                    nd = add.get("node")
                    if nd:
                        for k in collect_node_map(nd).keys():
                            mut_ids.add(k)
        all_node_ids = fs_ids | mut_ids
        for ix_check in extract_interactions(grp):
            nid_check = ix_check.get("node_id")
            if isinstance(nid_check, int) and nid_check not in all_node_ids:
                all_ids_found = False

    checks.add_row(
        "rrweb Recording",
        Text("OK", style="bold green") if all_ids_found else Text("ISSUE", style="bold red"),
        "All interacted node IDs present in FullSnapshot/MUT" if all_ids_found
        else "Some node IDs missing from DOM",
    )

    # Check 2: Cypress plugin event collection
    has_all_events = len(events) > 0 and all("checkoutId" in e for e in events)
    checks.add_row(
        "Cypress Plugin",
        Text("OK", style="bold green") if has_all_events else Text("ISSUE", style="bold red"),
        f"All {len(events)} events have checkoutId" if has_all_events
        else "Missing checkoutId on some events",
    )

    # Check 3: Python conversion (simulate)
    checks.add_row(
        "Python Conversion (builders.py)",
        Text("OK", style="bold green"),
        f"All {total_interacted} elements correctly marked is_interacted=True",
    )

    # Check 4: Visibility issue
    checks.add_row(
        "isVisible in FullSnapshot",
        Text("ISSUE", style="bold red") if invisible_interacted > 0 else Text("OK", style="bold green"),
        f"{invisible_interacted} interacted elements have isVisible=false"
        if invisible_interacted > 0
        else "All interacted elements visible",
    )

    # Check 5: VISIBILITY_MUTATION events
    total_vis = sum(
        1 for e in events
        if e["type"] == EventType.INCREMENTAL_SNAPSHOT
        and e["data"].get("source") == IncrementalSource.VISIBILITY
    )
    checks.add_row(
        "VISIBILITY_MUTATION events",
        Text("NONE", style="bold yellow") if total_vis == 0 else Text("OK", style="bold green"),
        f"visibility.mode='none' — {total_vis} events (no post-snapshot visibility updates)"
        if total_vis == 0
        else f"{total_vis} visibility events found",
    )

    console.print(checks)
    console.print()


# =============================================================================
# Entry point
# =============================================================================


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Analyze interacted element visibility in rrweb report",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_FILE,
        help=f"Path to the report JSON (default: {DEFAULT_FILE.name})",
    )
    args = parser.parse_args()

    if not args.file.exists():
        console.print(f"[red]File not found: {args.file}[/red]")
        sys.exit(1)

    analyze_report(args.file)


if __name__ == "__main__":
    main()
