"""Diagnose TestMap page-segmentation & tested-element binding on rrweb reports.

Built for three QA complaints (June 2026):
  * steinwaysociety.com — all pages lumped into one main page (as snapshots)
  * pinarello.com       — same lumping after link-hopping from the main page
  * dublin.ca.gov       — pages OK, but main page shows NO tested elements

The script reconstructs THREE views of the same event stream and compares them:

  1. RECORDER INSTANCES (ground truth) — the sequential-id plugin writes
     `event.id = ++localId` per recorder instance; the counter resets on every
     full page load. An `id` drop between adjacent events = new page load.
  2. CID SESSIONS (converter model A) — backend groups events into sessions
     whenever `checkoutId` CHANGES between adjacent events. checkoutId also
     resets per page load (first session of a page is always cid=1), so a page
     that never reached the in-page checkout threshold (checkoutEveryNvm)
     keeps cid=1 throughout — and two adjacent pages both at cid=1 MERGE.
  3. META SESSIONS (converter model B) — split at every META event.

Pages are then emulated per converter logic: snapshot href = first META in
session; pages = snapshots merged by href. Tested elements = USER actions
(mouse interaction / input) whose target id resolves in the session node_map
(first FullSnapshot elements + MUTATION.adds elements).

Verdicts:
  V1  every META is followed by a FullSnapshot before the next META
  V2  no cid collision across recorder-instance boundaries (else pages merge)
  V3  every USER action resolves to an element in its own cid-session node_map
  V4  click-like test steps have matching recorded MOUSE_INTERACTION events

Usage:
    python3 scripts/analyze_page_segmentation.py --file PATH [--full]
    python3 scripts/analyze_page_segmentation.py --dir test-results/playwright/ui [--compact]

Exit code: 0 = all checks pass, 1 = at least one FAIL.
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
# rrweb enums — mirrored from packages/types/src/index.ts
# =============================================================================

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


class NodeType:
    DOCUMENT = 0
    DOCUMENT_TYPE = 1
    ELEMENT = 2
    TEXT = 3
    CDATA = 4


MOUSE_TYPE_NAMES = {
    0: "mouse_up", 1: "mouse_down", 2: "click", 3: "context_menu",
    4: "dbl_click", 5: "focus", 6: "blur", 7: "touch_start",
    8: "touch_move_departed", 9: "touch_end", 10: "touch_cancel",
}

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

console = Console()


# =============================================================================
# Small helpers
# =============================================================================

def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts / 1000).strftime("%H:%M:%S.%f")[:-3]


def short(s: str, n: int = 60) -> str:
    return s if len(s) <= n else s[: n - 1] + "…"


def meta_href(e: dict) -> str | None:
    if e.get("type") == EventType.META:
        return (e.get("data") or {}).get("href")
    return None


def first_meta_href(events: list[dict]) -> str:
    for e in events:
        h = meta_href(e)
        if h:
            return h
    return "(no META)"


def is_user_action(e: dict) -> bool:
    if e.get("type") != EventType.INCREMENTAL_SNAPSHOT:
        return False
    src = (e.get("data") or {}).get("source")
    return src in (IncrementalSource.MOUSE_INTERACTION, IncrementalSource.INPUT)


def walk_elements(node: dict, out: dict[int, dict]) -> None:
    """Collect ELEMENT nodes {id: {tag, selector}} from a serialized tree."""
    if not isinstance(node, dict):
        return
    if node.get("type") == NodeType.ELEMENT and isinstance(node.get("id"), int):
        out.setdefault(node["id"], {
            "tag": node.get("tagName", ""),
            "selector": node.get("selector", ""),
        })
    for child in node.get("childNodes") or []:
        walk_elements(child, out)


def session_node_map(events: list[dict]) -> dict[int, dict]:
    """Converter model: elements from FIRST FullSnapshot + all MUTATION.adds."""
    node_map: dict[int, dict] = {}
    fs_seen = False
    for e in events:
        if e.get("type") == EventType.FULL_SNAPSHOT and not fs_seen:
            fs_seen = True
            walk_elements((e.get("data") or {}).get("node") or {}, node_map)
        elif e.get("type") == EventType.INCREMENTAL_SNAPSHOT:
            data = e.get("data") or {}
            if data.get("source") == IncrementalSource.MUTATION:
                for add in data.get("adds") or []:
                    walk_elements(add.get("node") or {}, node_map)
    return node_map


def all_fs_node_maps(events: list[dict]) -> list[tuple[int, dict[int, dict]]]:
    """[(event_index, {id: el})] for EVERY FullSnapshot in the stream."""
    result = []
    for i, e in enumerate(events):
        if e.get("type") == EventType.FULL_SNAPSHOT:
            m: dict[int, dict] = {}
            walk_elements((e.get("data") or {}).get("node") or {}, m)
            result.append((i, m))
    return result


# =============================================================================
# Stream segmentation — three views
# =============================================================================

def split_recorder_instances(events: list[dict]) -> list[dict]:
    """Ground truth: new instance when sequential `id` drops (plugin reset).

    Falls back to META-boundaries when events carry no sequential id.
    """
    has_seq = any(isinstance(e.get("id"), int) for e in events)
    instances: list[dict] = []
    cur: list[tuple[int, dict]] = []
    prev_seq: int | None = None

    def push() -> None:
        if cur:
            instances.append({
                "index": len(instances),
                "events": [e for _, e in cur],
                "ev_range": (cur[0][0], cur[-1][0]),
            })

    if has_seq:
        for i, e in enumerate(events):
            seq = e.get("id")
            if isinstance(seq, int):
                if prev_seq is not None and seq <= prev_seq:
                    push()
                    cur = []
                prev_seq = seq
            cur.append((i, e))
        push()
    else:
        for i, e in enumerate(events):
            if e.get("type") == EventType.META and cur:
                push()
                cur = []
            cur.append((i, e))
        push()
    return instances


def split_cid_sessions(events: list[dict]) -> list[dict]:
    """Converter model A: new session whenever checkoutId differs from prev."""
    sessions: list[dict] = []
    cur: list[tuple[int, dict]] = []
    cur_cid: Any = object()  # sentinel != any real cid

    for i, e in enumerate(events):
        cid = e.get("checkoutId")
        if cur and cid != cur_cid:
            sessions.append({
                "index": len(sessions),
                "checkout_id": cur_cid,
                "events": [ev for _, ev in cur],
                "ev_range": (cur[0][0], cur[-1][0]),
            })
            cur = []
        cur_cid = cid
        cur.append((i, e))

    if cur:
        sessions.append({
            "index": len(sessions),
            "checkout_id": cur_cid,
            "events": [ev for _, ev in cur],
            "ev_range": (cur[0][0], cur[-1][0]),
        })
    return sessions


def split_meta_sessions(events: list[dict]) -> list[dict]:
    """Converter model B: split at every META event."""
    sessions: list[dict] = []
    cur: list[tuple[int, dict]] = []
    for i, e in enumerate(events):
        if e.get("type") == EventType.META and cur:
            sessions.append({
                "index": len(sessions),
                "events": [ev for _, ev in cur],
                "ev_range": (cur[0][0], cur[-1][0]),
            })
            cur = []
        cur.append((i, e))
    if cur:
        sessions.append({
            "index": len(sessions),
            "events": [ev for _, ev in cur],
            "ev_range": (cur[0][0], cur[-1][0]),
        })
    return sessions


def session_stats(events: list[dict]) -> dict:
    fs = sum(1 for e in events if e.get("type") == EventType.FULL_SNAPSHOT)
    metas = sum(1 for e in events if e.get("type") == EventType.META)
    clicks = sum(
        1 for e in events
        if e.get("type") == EventType.INCREMENTAL_SNAPSHOT
        and (e.get("data") or {}).get("source") == IncrementalSource.MOUSE_INTERACTION
    )
    inputs = sum(
        1 for e in events
        if e.get("type") == EventType.INCREMENTAL_SNAPSHOT
        and (e.get("data") or {}).get("source") == IncrementalSource.INPUT
    )
    customs = sum(1 for e in events if e.get("type") == EventType.CUSTOM)
    cids = sorted({e.get("checkoutId") for e in events if e.get("checkoutId") is not None})
    seqs = [e.get("id") for e in events if isinstance(e.get("id"), int)]
    return {
        "fs": fs, "metas": metas, "clicks": clicks, "inputs": inputs,
        "customs": customs, "cids": cids,
        "seq_range": (min(seqs), max(seqs)) if seqs else None,
    }


# =============================================================================
# Printing
# =============================================================================

def print_header(title: str) -> None:
    console.print()
    console.print(Panel(Text(title, style="bold cyan"), expand=False))


def print_groups_table(title: str, groups: list[dict], extra_cid: bool = False) -> None:
    table = Table(show_header=True, title=title, header_style="bold magenta")
    table.add_column("#", justify="right", style="dim", width=3)
    table.add_column("Events", justify="right", style="dim")
    if extra_cid:
        table.add_column("cid", justify="right")
    table.add_column("cids inside", style="dim")
    table.add_column("seq", style="dim")
    table.add_column("META", justify="right")
    table.add_column("FS", justify="right")
    table.add_column("clicks", justify="right", style="yellow")
    table.add_column("inputs", justify="right", style="yellow")
    table.add_column("first href", style="cyan", max_width=58)

    for g in groups:
        st = session_stats(g["events"])
        lo, hi = g["ev_range"]
        row = [str(g["index"]), f"{lo}-{hi}"]
        if extra_cid:
            row.append(str(g.get("checkout_id")))
        row += [
            ",".join(str(c) for c in st["cids"]) or "-",
            f"{st['seq_range'][0]}-{st['seq_range'][1]}" if st["seq_range"] else "-",
            str(st["metas"]),
            str(st["fs"]),
            str(st["clicks"]),
            str(st["inputs"]),
            short(first_meta_href(g["events"])),
        ]
        fs_style = "red" if st["fs"] == 0 else ""
        table.add_row(*row, style=fs_style or None)
    console.print(table)


def print_pages_table(title: str, groups: list[dict]) -> dict[str, list[dict]]:
    """Emulate converter page merging (by first-META href). Returns pages."""
    pages: dict[str, list[dict]] = {}
    for g in groups:
        href = first_meta_href(g["events"])
        pages.setdefault(href, []).append(g)

    table = Table(show_header=True, title=title, header_style="bold magenta")
    table.add_column("#", justify="right", style="dim", width=3)
    table.add_column("href", style="cyan", max_width=62)
    table.add_column("snapshots", justify="right")
    table.add_column("clicks", justify="right", style="yellow")
    table.add_column("inputs", justify="right", style="yellow")
    for i, (href, sess) in enumerate(pages.items()):
        clicks = sum(session_stats(s["events"])["clicks"] for s in sess)
        inputs = sum(session_stats(s["events"])["inputs"] for s in sess)
        table.add_row(str(i), short(href, 62), str(len(sess)), str(clicks), str(inputs))
    console.print(table)
    return pages


def print_custom_steps(events: list[dict], instances: list[dict]) -> None:
    """Compact timeline of Playwright custom steps with instance attribution."""
    ev_to_inst: dict[int, int] = {}
    for inst in instances:
        lo, hi = inst["ev_range"]
        for i in range(lo, hi + 1):
            ev_to_inst[i] = inst["index"]

    table = Table(show_header=True, title="Playwright steps (CUSTOM events)",
                  header_style="bold magenta")
    table.add_column("ev#", justify="right", style="dim")
    table.add_column("inst", justify="right", style="dim")
    table.add_column("cid", justify="right", style="dim")
    table.add_column("ts", style="dim")
    table.add_column("tag/api", style="yellow", max_width=40)
    table.add_column("detail", max_width=60)

    for i, e in enumerate(events):
        if e.get("type") != EventType.CUSTOM:
            continue
        data = e.get("data") or {}
        payload = data.get("payload") or {}
        api = payload.get("apiName") or payload.get("title") or data.get("tag") or "?"
        detail = ""
        params = payload.get("params")
        if isinstance(params, dict):
            detail = params.get("url") or params.get("selector") or ""
        elem = payload.get("element")
        if isinstance(elem, dict):
            detail = f"{detail} el.id={elem.get('id')}".strip()
        table.add_row(
            str(i), str(ev_to_inst.get(i, "?")), str(e.get("checkoutId")),
            fmt_ts(e.get("timestamp", 0)), short(str(api), 40), short(str(detail), 60),
        )
    console.print(table)


# =============================================================================
# Verdicts
# =============================================================================

class Verdicts:
    def __init__(self) -> None:
        self.items: list[tuple[str, str, str]] = []  # (status, code, message)

    def add(self, ok: bool, code: str, message: str, warn: bool = False) -> None:
        status = "PASS" if ok else ("WARN" if warn else "FAIL")
        self.items.append((status, code, message))

    @property
    def failed(self) -> bool:
        return any(s == "FAIL" for s, _, _ in self.items)

    def print(self) -> None:
        print_header("VERDICTS")
        for status, code, message in self.items:
            style = {"PASS": "green", "WARN": "yellow", "FAIL": "bold red"}[status]
            console.print(f"  [{style}]{status}[/{style}] [{code}] {message}")


def check_meta_fs_pairing(events: list[dict], v: Verdicts) -> None:
    meta_idx = [i for i, e in enumerate(events) if e.get("type") == EventType.META]
    unpaired = []
    for k, mi in enumerate(meta_idx):
        nxt = meta_idx[k + 1] if k + 1 < len(meta_idx) else len(events)
        if not any(events[j].get("type") == EventType.FULL_SNAPSHOT for j in range(mi + 1, nxt)):
            unpaired.append((mi, meta_href(events[mi]) or "(no href)"))
    if unpaired:
        v.add(False, "V1",
              f"{len(unpaired)} META без FullSnapshot до следующего META: "
              + "; ".join(f"ev#{i} {short(h, 50)}" for i, h in unpaired))
    else:
        v.add(True, "V1", f"все {len(meta_idx)} META имеют FullSnapshot")


def check_cid_collisions(instances: list[dict], cid_sessions: list[dict],
                         v: Verdicts) -> list[tuple[int, int, Any]]:
    """Detect instance boundaries invisible to the cid-grouping converter."""
    collisions = []
    for a, b in zip(instances, instances[1:]):
        last_cid = a["events"][-1].get("checkoutId")
        first_cid = b["events"][0].get("checkoutId")
        if last_cid == first_cid:
            collisions.append((a["index"], b["index"], last_cid))
    if collisions:
        v.add(False, "V2",
              f"{len(collisions)} граница(ы) страниц НЕВИДИМЫ для cid-группировки "
              f"(cid не меняется на стыке): "
              + "; ".join(f"inst{a}→inst{b} cid={c}" for a, b, c in collisions)
              + f" — конвертер увидит {len(cid_sessions)} сессий вместо {len(instances)}")
    else:
        v.add(True, "V2",
              f"все границы инстансов видимы cid-группировке "
              f"({len(instances)} инстансов → {len(cid_sessions)} cid-сессий)")
    return collisions


def check_action_linkage(cid_sessions: list[dict], events: list[dict],
                         v: Verdicts, verbose: bool) -> None:
    fs_maps = all_fs_node_maps(events)
    rows = []
    unlinked = 0
    total = 0
    for s in cid_sessions:
        nmap = session_node_map(s["events"])
        for e in s["events"]:
            if not is_user_action(e):
                continue
            data = e.get("data") or {}
            src = data.get("source")
            target = data.get("id")
            total += 1
            el = nmap.get(target)
            linked = el is not None
            if not linked:
                unlinked += 1
            home = [str(fi) for fi, m in enumerate(fs_maps) if target in m]
            kind = (MOUSE_TYPE_NAMES.get(data.get("type"), "?")
                    if src == IncrementalSource.MOUSE_INTERACTION else "input")
            rows.append({
                "session": s["index"], "kind": kind, "target": target,
                "linked": linked,
                "el": el, "found_in_fs": ",".join(home) or "-",
                "ts": e.get("timestamp", 0),
            })

    if rows:
        table = Table(show_header=True, title="USER actions → node_map linkage (cid-sessions)",
                      header_style="bold magenta")
        table.add_column("sess", justify="right", style="dim")
        table.add_column("ts", style="dim")
        table.add_column("action", style="yellow")
        table.add_column("target id", justify="right")
        table.add_column("linked", justify="center")
        table.add_column("in FS#", style="dim")
        table.add_column("element", max_width=70)
        for r in rows:
            el_desc = ""
            if r["el"]:
                el_desc = f"<{r['el']['tag']}> {short(r['el'].get('selector') or '', 60)}"
            table.add_row(
                str(r["session"]), fmt_ts(r["ts"]), r["kind"], str(r["target"]),
                Text("yes", style="green") if r["linked"] else Text("NO", style="bold red"),
                r["found_in_fs"], el_desc,
            )
        console.print(table)

    if total == 0:
        v.add(True, "V3", "USER-действий в отчёте нет (нечего привязывать)", warn=True)
    elif unlinked:
        v.add(False, "V3", f"{unlinked}/{total} USER-действий НЕ привязаны к node_map своей cid-сессии")
    else:
        v.add(True, "V3", f"все {total} USER-действий привязаны к элементам своих cid-сессий")


def check_click_steps_vs_events(events: list[dict], v: Verdicts) -> None:
    click_steps = 0
    for e in events:
        if e.get("type") != EventType.CUSTOM:
            continue
        payload = (e.get("data") or {}).get("payload") or {}
        api = str(payload.get("apiName") or payload.get("title") or "").lower()
        if "click" in api:
            click_steps += 1
    clicks = sum(
        1 for e in events
        if e.get("type") == EventType.INCREMENTAL_SNAPSHOT
        and (e.get("data") or {}).get("source") == IncrementalSource.MOUSE_INTERACTION
        and (e.get("data") or {}).get("type") == 2
    )
    if click_steps and not clicks:
        v.add(False, "V4", f"{click_steps} click-шаг(ов) Playwright, но 0 записанных click-событий")
    else:
        v.add(True, "V4", f"click-шагов: {click_steps}, записанных click-событий: {clicks}",
              warn=(click_steps == 0 and clicks == 0))


# =============================================================================
# Per-report analysis
# =============================================================================

def analyze_report(path: Path, full: bool, compact: bool) -> bool:
    """Returns True if all checks passed."""
    print_header(f"REPORT: {path.name}")
    console.print(f"[dim]{path}[/dim]")

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    events = data.get("events", [])
    metadata = data.get("metadata", {})
    recorder = (metadata.get("runner") or {}).get("recorder") or {}
    console.print(
        f"events=[green]{len(events)}[/green]  "
        f"recorder={recorder.get('scriptVersion', '?')}"
    )
    if not events:
        console.print("[bold red]Пустой отчёт — событий нет.[/bold red]")
        return False

    # Three views
    instances = split_recorder_instances(events)
    cid_sessions = split_cid_sessions(events)
    meta_sessions = split_meta_sessions(events)

    console.print(
        f"instances(ground truth)=[bold]{len(instances)}[/bold]  "
        f"cid-sessions=[bold]{len(cid_sessions)}[/bold]  "
        f"meta-sessions=[bold]{len(meta_sessions)}[/bold]"
    )

    print_groups_table("Recorder instances (sequential-id resets)", instances)
    if not compact:
        print_groups_table("CID sessions (converter model A)", cid_sessions, extra_cid=True)
        print_pages_table("Pages — converter model A (merge by href)", cid_sessions)
        print_pages_table("Pages — converter model B (META split, merge by href)", meta_sessions)
        print_custom_steps(events, instances)

    v = Verdicts()
    check_meta_fs_pairing(events, v)
    check_cid_collisions(instances, cid_sessions, v)
    check_action_linkage(cid_sessions, events, v, verbose=not compact)
    check_click_steps_vs_events(events, v)
    v.print()

    if full:
        print_header("FULL META/FS/CLICK TIMELINE")
        table = Table(show_header=True, header_style="bold magenta")
        table.add_column("ev#", justify="right", style="dim")
        table.add_column("seq", justify="right", style="dim")
        table.add_column("cid", justify="right", style="dim")
        table.add_column("ts", style="dim")
        table.add_column("what", max_width=90)
        for i, e in enumerate(events):
            etype = e.get("type")
            data = e.get("data") or {}
            desc = None
            style = ""
            if etype == EventType.META:
                desc, style = f"META {data.get('href')}", "cyan"
            elif etype == EventType.FULL_SNAPSHOT:
                desc, style = "FULL_SNAPSHOT", "green"
            elif etype == EventType.CUSTOM:
                payload = data.get("payload") or {}
                desc, style = f"CUSTOM {payload.get('apiName') or data.get('tag')}", "yellow"
            elif (etype == EventType.INCREMENTAL_SNAPSHOT
                  and data.get("source") == IncrementalSource.MOUSE_INTERACTION):
                desc = (f"{MOUSE_TYPE_NAMES.get(data.get('type'), '?')} "
                        f"target={data.get('id')}")
                style = "magenta"
            if desc:
                table.add_row(str(i), str(e.get("id", "-")), str(e.get("checkoutId", "-")),
                              fmt_ts(e.get("timestamp", 0)), Text(desc, style=style))
        console.print(table)

    return not v.failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", "-f", type=Path, help="Один JSON-отчёт")
    parser.add_argument("--dir", "-d", type=Path, default=None,
                        help=f"Каталог с отчётами (default: {REPORT_DIR})")
    parser.add_argument("--full", action="store_true", help="Полный таймлайн META/FS/кликов")
    parser.add_argument("--compact", action="store_true",
                        help="Только инстансы + вердикты (для пачки отчётов)")
    args = parser.parse_args()

    files: list[Path] = []
    if args.file:
        files = [args.file]
    else:
        base = args.dir or REPORT_DIR
        files = sorted(base.rglob("*.json"))
        if not files:
            console.print(f"[red]Нет JSON-отчётов в {base}[/red]")
            sys.exit(2)

    all_ok = True
    for path in files:
        if not path.exists():
            console.print(f"[red]Файл не найден: {path}[/red]")
            all_ok = False
            continue
        ok = analyze_report(path, full=args.full, compact=args.compact)
        all_ok = all_ok and ok

    console.print()
    if all_ok:
        console.print("[bold green]ИТОГ: все проверки пройдены.[/bold green]")
    else:
        console.print("[bold red]ИТОГ: есть FAIL — см. вердикты выше.[/bold red]")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
