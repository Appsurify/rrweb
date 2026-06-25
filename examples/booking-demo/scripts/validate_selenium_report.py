#!/usr/bin/env python3
"""Validate Selenium rrweb reports for each runner stack.

For every runner stack (mocha / jest / vitest / node:test) this performs two
layers of validation against the reports produced by
``@appsurify-testmap/rrweb-selenium-plugin``:

  1. Structural — the report envelope ``{events, metadata}`` (and nothing else,
     since the backend does ``UIRawReportData(**report)``), required metadata
     blocks, ``runner.source == "selenium"``, sequential ``id`` stamping, the
     presence of META + FULL_SNAPSHOT events, META→FULL_SNAPSHOT ordering (the
     converter groups pages by META), and the ``ui-coverage-reports.zip`` bundle.

  2. Conversion — runs the REAL appsurify-testmap backend converter
     (``testmap.infrastructure.ui_report.Report.from_raw``) on each report and
     asserts it yields pages, snapshots, elements, actions and interaction
     coverage. This proves the report is consumable by the production pipeline,
     not merely well-shaped. Skipped (with a warning) if the backend source is
     not importable.

Usage:
    python3 scripts/validate_selenium_report.py
    python3 scripts/validate_selenium_report.py --runner mocha
    python3 scripts/validate_selenium_report.py --dir <test-results/selenium/ui>
    python3 scripts/validate_selenium_report.py --backend <appsurify-testmap-backend/src>
    python3 scripts/validate_selenium_report.py --no-convert     # structural only

Exit code is non-zero if any stack fails, so it is usable in CI.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()

# --- Layout -----------------------------------------------------------------
SELENIUM_DIR = Path(__file__).resolve().parent.parent / "selenium"
REPORT_SUBPATH = Path("test-results") / "selenium" / "ui"
RUNNERS = ["mocha", "jest", "vitest", "node-test"]
ZIP_NAME = "ui-coverage-reports.zip"

DEFAULT_BACKEND_SRC = Path(
    os.environ.get("TESTMAP_BACKEND_SRC")
    or "/Users/whenessel/Development/PycharmProjects/appsurify-testmap-backend/src"
)


# rrweb EventType — mirrored from packages/types/src/index.ts
class EventType:
    DOM_CONTENT_LOADED = 0
    LOAD = 1
    FULL_SNAPSHOT = 2
    INCREMENTAL_SNAPSHOT = 3
    META = 4
    CUSTOM = 5
    PLUGIN = 6


VALID_EVENT_TYPES = {0, 1, 2, 3, 4, 5, 6}
REQUIRED_METADATA_KEYS = ("runner", "spec", "suite", "test", "browser")


# --- Result containers ------------------------------------------------------
@dataclass
class ReportResult:
    path: Path
    struct_errors: list[str] = field(default_factory=list)
    conv_errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    # populated by the conversion layer
    attempted_conversion: bool = False
    metrics: dict[str, Any] = field(default_factory=dict)

    @property
    def errors(self) -> list[str]:
        return self.struct_errors + self.conv_errors

    @property
    def ok(self) -> bool:
        return not self.errors

    @property
    def converted(self) -> bool:
        return self.attempted_conversion and not self.conv_errors


@dataclass
class StackResult:
    name: str
    ui_dir: Path
    found: bool = False
    reports: list[ReportResult] = field(default_factory=list)
    zip_ok: bool = False
    zip_entries: int = 0
    stack_errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return (
            self.found
            and not self.stack_errors
            and bool(self.reports)
            and all(r.ok for r in self.reports)
        )


# --- Backend converter (optional) -------------------------------------------
def load_converter(backend_src: Path):
    """Import the real backend ``Report`` class, or return (None, reason)."""
    if not backend_src.exists():
        return None, f"backend src not found: {backend_src}"
    if str(backend_src) not in sys.path:
        sys.path.insert(0, str(backend_src))
    try:
        from testmap.infrastructure.ui_report import Report  # type: ignore

        return Report, None
    except Exception as exc:  # pragma: no cover - environment dependent
        return None, f"import failed ({type(exc).__name__}): {exc}"


# --- Structural validation --------------------------------------------------
def validate_structure(report: Any) -> ReportResult | tuple[list[str], list[str]]:
    """Return (errors, warnings) for a single parsed report dict."""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(report, dict):
        return ["report is not a JSON object"], []

    # The backend does `UIRawReportData(**report)` — extra top-level keys throw.
    extra = set(report.keys()) - {"events", "metadata"}
    if extra:
        errors.append(f"unexpected top-level keys (break UIRawReportData): {sorted(extra)}")
    if "events" not in report:
        errors.append("missing top-level 'events'")
    if "metadata" not in report:
        errors.append("missing top-level 'metadata'")

    events = report.get("events")
    metadata = report.get("metadata")

    if not isinstance(events, list):
        errors.append("'events' is not a list")
        events = []
    elif not events:
        errors.append("'events' is empty")

    if not isinstance(metadata, dict):
        errors.append("'metadata' is not an object")
        metadata = {}

    # metadata blocks
    for key in REQUIRED_METADATA_KEYS:
        if key not in metadata:
            errors.append(f"metadata.{key} missing")

    # runner — UITestRunnerData requires source, type, version (no defaults).
    runner = metadata.get("runner") or {}
    if runner.get("source") != "selenium":
        errors.append(f"runner.source != 'selenium' (got {runner.get('source')!r})")
    for f in ("type", "version"):
        if f not in runner:
            errors.append(f"runner.{f} missing (required by UITestRunnerData)")
    recorder = runner.get("recorder") or {}
    if not recorder.get("scriptVersion"):
        warnings.append("runner.recorder.scriptVersion missing")
    if not recorder.get("libVersion"):
        warnings.append("runner.recorder.libVersion missing")

    # suite — UITestSuiteData requires id, title, type, root (no defaults).
    suite = metadata.get("suite") or {}
    for f in ("id", "title", "type", "root"):
        if f not in suite:
            errors.append(f"suite.{f} missing (required by UITestSuiteData)")

    # test — UITestData requires title (no default).
    test = metadata.get("test") or {}
    if "title" not in test:
        errors.append("test.title missing (required by UITestData)")

    # browser — UIBrowserData requires name (no default).
    browser = metadata.get("browser") or {}
    if "name" not in browser:
        errors.append("browser.name missing (required by UIBrowserData)")

    # event-level checks
    metas = full_snaps = customs = incrementals = 0
    missing_id = 0
    first_meta_idx: int | None = None
    full_snap_before_meta = False
    for idx, ev in enumerate(events):
        if not isinstance(ev, dict):
            errors.append(f"event[{idx}] is not an object")
            continue
        et = ev.get("type")
        if et not in VALID_EVENT_TYPES:
            errors.append(f"event[{idx}] invalid type {et!r}")
        if "timestamp" not in ev:
            errors.append(f"event[{idx}] missing timestamp")
        if "data" not in ev:
            errors.append(f"event[{idx}] missing data")
        if ev.get("id") is None:
            missing_id += 1

        if et == EventType.META:
            metas += 1
            if first_meta_idx is None:
                first_meta_idx = idx
            if not (isinstance(ev.get("data"), dict) and ev["data"].get("href")):
                warnings.append(f"META event[{idx}] has no data.href")
        elif et == EventType.FULL_SNAPSHOT:
            full_snaps += 1
            if first_meta_idx is None:
                full_snap_before_meta = True
            if not (isinstance(ev.get("data"), dict) and ev["data"].get("node")):
                errors.append(f"FULL_SNAPSHOT event[{idx}] has no data.node")
        elif et == EventType.CUSTOM:
            customs += 1
        elif et == EventType.INCREMENTAL_SNAPSHOT:
            incrementals += 1

    if metas == 0:
        errors.append("no META (type 4) events — converter cannot resolve page href")
    if full_snaps == 0:
        errors.append("no FULL_SNAPSHOT (type 2) events — converter yields no elements")
    if full_snap_before_meta:
        warnings.append("a FULL_SNAPSHOT precedes the first META (page href will be synthetic)")
    if events and missing_id == len(events):
        warnings.append("no events carry a sequential 'id' (sequential-id plugin not applied)")
    elif missing_id:
        warnings.append(f"{missing_id}/{len(events)} events missing 'id'")

    return errors, warnings


# --- Conversion validation --------------------------------------------------
def validate_conversion(Report, report: dict) -> tuple[list[str], list[str], dict[str, Any]]:
    """Run the real backend converter; return (errors, warnings, metrics)."""
    errors: list[str] = []
    warnings: list[str] = []
    metrics: dict[str, Any] = {}
    try:
        r = Report.from_raw(report, body_only=True)
    except Exception as exc:
        return [f"converter raised {type(exc).__name__}: {exc}"], [], {}

    pages = r.get_pages()
    snapshots = [s for p in pages for s in p.snapshots]
    elements = [e for s in snapshots for e in s.elements]
    actions = [a for s in snapshots for a in s.actions]
    stats = r.stats
    interactive_total = getattr(stats, "interactive_total", 0) if stats else 0
    interacted = getattr(stats, "interactive_interacted", 0) if stats else 0
    coverage = (interacted / interactive_total * 100) if interactive_total else 0.0

    metrics = {
        "pages": len(pages),
        "snapshots": len(snapshots),
        "elements": len(elements),
        "actions": len(actions),
        "interactive_total": interactive_total,
        "interacted": interacted,
        "coverage": coverage,
        "hrefs": [p.href for p in pages],
    }

    # Hard requirements: a report that cannot produce these is unconvertible.
    if not pages:
        errors.append("conversion produced 0 pages")
    if not snapshots:
        errors.append("conversion produced 0 snapshots")
    if not elements:
        errors.append("conversion produced 0 elements")

    # Expectations for an interactive test (soft — surfaced as warnings).
    if interactive_total == 0:
        warnings.append("0 interactive elements collected")
    if not actions:
        warnings.append("0 actions collected (no user/test interactions captured)")
    if interactive_total and interacted == 0:
        warnings.append("0 interactive elements interacted (coverage 0%)")

    return errors, warnings, metrics


# --- Filesystem helpers -----------------------------------------------------
def find_report_files(ui_dir: Path) -> list[Path]:
    """All per-test report JSONs under ui_dir (the ZIP is binary, not matched)."""
    return sorted(p for p in ui_dir.rglob("*.json"))


def validate_zip(ui_dir: Path, expected: int) -> tuple[bool, int, list[str]]:
    errors: list[str] = []
    zip_path = ui_dir / ZIP_NAME
    if not zip_path.exists():
        return False, 0, [f"{ZIP_NAME} not found"]
    try:
        with zipfile.ZipFile(zip_path) as zf:
            names = zf.namelist()
            bad = [n for n in names if not n.endswith(".json")]
            if bad:
                errors.append(f"ZIP contains non-JSON entries: {bad[:3]}")
            # parse one entry to confirm integrity
            if names:
                json.loads(zf.read(names[0]))
    except Exception as exc:
        return False, 0, [f"ZIP unreadable: {exc}"]
    if expected and len(names) != expected:
        errors.append(f"ZIP entry count {len(names)} != per-test JSON count {expected}")
    return (not errors), len(names), errors


# --- Stack validation -------------------------------------------------------
def validate_stack(name: str, ui_dir: Path, Report) -> StackResult:
    result = StackResult(name=name, ui_dir=ui_dir)
    if not ui_dir.exists():
        result.stack_errors.append(f"report dir not found: {ui_dir} (run the demo first)")
        return result
    result.found = True

    files = find_report_files(ui_dir)
    if not files:
        result.stack_errors.append("no per-test report JSON files found")
        return result

    for f in files:
        rr = ReportResult(path=f)
        try:
            report = json.loads(f.read_text())
        except Exception as exc:
            rr.struct_errors.append(f"invalid JSON: {exc}")
            result.reports.append(rr)
            continue

        s_err, s_warn = validate_structure(report)
        rr.struct_errors.extend(s_err)
        rr.warnings.extend(s_warn)

        if Report is not None and not s_err:
            rr.attempted_conversion = True
            c_err, c_warn, metrics = validate_conversion(Report, report)
            rr.conv_errors.extend(c_err)
            rr.warnings.extend(c_warn)
            rr.metrics = metrics

        result.reports.append(rr)

    result.zip_ok, result.zip_entries, zip_errs = validate_zip(ui_dir, len(files))
    result.stack_errors.extend(zip_errs)
    return result


# --- Rendering --------------------------------------------------------------
def render_stack_detail(stack: StackResult) -> None:
    title = f"[bold]{stack.name}[/bold]  ([dim]{stack.ui_dir}[/dim])"
    if not stack.found:
        console.print(Panel(Text("\n".join(stack.stack_errors), style="yellow"), title=title, border_style="yellow"))
        return

    table = Table(show_header=True, header_style="bold", expand=True)
    table.add_column("report", overflow="fold", ratio=3)
    table.add_column("struct", justify="center")
    table.add_column("convert", justify="center")
    table.add_column("pages", justify="right")
    table.add_column("snaps", justify="right")
    table.add_column("elems", justify="right")
    table.add_column("acts", justify="right")
    table.add_column("cover", justify="right")

    for rr in stack.reports:
        m = rr.metrics
        struct = "[red]FAIL[/red]" if rr.struct_errors else "[green]ok[/green]"
        if not rr.attempted_conversion:
            convert = "[dim]—[/dim]"
        else:
            convert = "[green]ok[/green]" if rr.converted else "[red]FAIL[/red]"
        cover = f"{m['coverage']:.0f}%" if m else "—"
        table.add_row(
            rr.path.name,
            struct,
            convert,
            str(m.get("pages", "—")) if m else "—",
            str(m.get("snapshots", "—")) if m else "—",
            str(m.get("elements", "—")) if m else "—",
            str(m.get("actions", "—")) if m else "—",
            cover,
        )

    zip_line = (
        f"[green]✓[/green] {ZIP_NAME} ({stack.zip_entries} entries)"
        if stack.zip_ok
        else f"[red]✗[/red] {ZIP_NAME}: {'; '.join(stack.stack_errors) or 'missing'}"
    )
    border = "green" if stack.ok else "red"
    console.print(Panel(table, title=title, subtitle=zip_line, border_style=border))

    # detail lines for any failing/ warning report
    for rr in stack.reports:
        for e in rr.errors:
            console.print(f"  [red]✗[/red] [dim]{rr.path.name}[/dim]: {e}")
        for w in rr.warnings:
            console.print(f"  [yellow]⚠[/yellow] [dim]{rr.path.name}[/dim]: {w}")


def render_summary(stacks: list[StackResult], converter_note: str | None) -> bool:
    table = Table(title="Selenium report validation — summary", show_header=True, header_style="bold cyan")
    table.add_column("stack")
    table.add_column("reports", justify="right")
    table.add_column("structural", justify="center")
    table.add_column("conversion", justify="center")
    table.add_column("zip", justify="center")
    table.add_column("result", justify="center")

    all_ok = True
    for s in stacks:
        if not s.found:
            table.add_row(s.name, "—", "[yellow]n/a[/yellow]", "[yellow]n/a[/yellow]", "[yellow]n/a[/yellow]", "[yellow]MISSING[/yellow]")
            all_ok = False
            continue
        n = len(s.reports)
        struct_fail = sum(1 for r in s.reports if r.struct_errors)
        structural = "[green]pass[/green]" if struct_fail == 0 else f"[red]{struct_fail} fail[/red]"
        attempted = [r for r in s.reports if r.attempted_conversion]
        if not attempted:
            conversion = "[dim]skipped[/dim]"
        else:
            conv_fail = sum(1 for r in attempted if not r.converted)
            conversion = "[green]pass[/green]" if conv_fail == 0 else f"[red]{conv_fail} fail[/red]"
        zip_cell = "[green]ok[/green]" if s.zip_ok else "[red]fail[/red]"
        res = "[green]PASS[/green]" if s.ok else "[red]FAIL[/red]"
        if not s.ok:
            all_ok = False
        table.add_row(s.name, str(n), structural, conversion, zip_cell, res)

    console.print(table)
    if converter_note:
        console.print(f"[yellow]conversion layer skipped:[/yellow] {converter_note}")
    return all_ok


# --- Main -------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--runner", choices=RUNNERS, help="validate a single runner stack")
    parser.add_argument("--dir", type=Path, help="validate a single report dir (test-results/selenium/ui)")
    parser.add_argument("--backend", type=Path, default=DEFAULT_BACKEND_SRC, help="path to appsurify-testmap-backend/src")
    parser.add_argument("--no-convert", action="store_true", help="skip the backend conversion layer")
    args = parser.parse_args()

    Report = None
    converter_note: str | None = None
    if args.no_convert:
        converter_note = "--no-convert"
    else:
        Report, reason = load_converter(args.backend)
        if Report is None:
            converter_note = reason

    console.print(
        Panel(
            Text.from_markup(
                "Validating Selenium rrweb reports against the appsurify-testmap "
                "ui_report converter.\n"
                f"backend: [dim]{args.backend}[/dim]  "
                f"converter: {'[green]loaded[/green]' if Report else '[yellow]unavailable[/yellow]'}"
            ),
            title="rrweb-selenium-plugin · report validation",
            border_style="cyan",
        )
    )

    stacks: list[StackResult] = []
    if args.dir:
        stacks.append(validate_stack(args.dir.name or "custom", args.dir, Report))
    else:
        runners = [args.runner] if args.runner else RUNNERS
        for runner in runners:
            ui_dir = SELENIUM_DIR / f"{runner}-selenium" / REPORT_SUBPATH
            stacks.append(validate_stack(runner, ui_dir, Report))

    for s in stacks:
        render_stack_detail(s)

    ok = render_summary(stacks, converter_note)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
