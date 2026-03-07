"""Комплексный анализ всех Cypress тестов booking-demo.

Обрабатывает все 4 тестовых отчета через backend модуль ui_report,
сравнивает ожидаемые и фактические данные на каждом уровне
(страницы, снапшоты, элементы, действия), выявляет расхождения.

Использование:
    TESTMAP_BACKEND_PATH=/path/to/backend/src python scripts/analyze_all_tests.py

    Environment variables:
        TESTMAP_BACKEND_PATH  Path to testmap backend src directory
                              (default: /Users/whenessel/Development/PycharmProjects/appsurify-testmap-backend/src)
"""

import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# ---------------------------------------------------------------------------
# Backend import
# ---------------------------------------------------------------------------
BACKEND_PATH = Path(
    os.environ.get(
        "TESTMAP_BACKEND_PATH",
        "/Users/whenessel/Development/PycharmProjects/appsurify-testmap-backend/src",
    )
)
if str(BACKEND_PATH) not in sys.path:
    sys.path.insert(0, str(BACKEND_PATH))

from testmap.infrastructure.ui_report import Report  # noqa: E402
from testmap.infrastructure.ui_report.types import ActionKind  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REPORT_DIR = Path(__file__).resolve().parent.parent / "test-results" / "cypress" / "ui"

console = Console(width=120)

# ---------------------------------------------------------------------------
# Ожидаемые значения (из анализа тестов)
# ---------------------------------------------------------------------------
EXPECTED: dict[str, dict[str, Any]] = {
    "full-booking-flow": {
        "report_file": (
            "full-booking-flow.spec.cy.ts/chrome/"
            "Book-Deluxe-Sea-View-Suite-completes-the-full-booking-flow.json"
        ),
        "label": "Полный букинг",
        "site": "modern-seaside-stay",
        "pages": {
            "count": 2,
            "hrefs_contain": ["/modern-seaside-stay/", "/booking"],
        },
        "snapshots_total": 5,
        "snapshots_per_page_min": [1, 3],
        "min_user_actions": 15,
        "expected_action_types": {"click", "type"},
        "min_interacted": 10,
    },
    "navigation-snapshots": {
        "report_file": (
            "navigation-snapshots.spec.cy.ts/chrome/"
            "Navigation-Snapshot-Validation-produces-snapshots-across-multiple-SPA-navigations.json"
        ),
        "label": "Навигация по страницам",
        "site": "modern-seaside-stay",
        "pages": {
            "count": 5,
            "hrefs_contain": [
                "/modern-seaside-stay/",
                "/apartments",
                "/amenities",
                "/gallery",
                "/contact",
            ],
        },
        "snapshots_total": 6,
        "snapshots_per_page_min": None,
        "min_user_actions": 5,
        "expected_action_types": {"click"},
        "min_interacted": 5,
    },
    "seaside-contact-form": {
        "report_file": (
            "seaside-contact-form.spec.cy.ts/chrome/"
            "Modern-Seaside-Stay-Contact-form-fills-and-submits-the-contact-form.json"
        ),
        "label": "Контактная форма",
        "site": "modern-seaside-stay",
        "pages": {
            "count": 2,
            "hrefs_contain": ["/modern-seaside-stay/", "/contact"],
        },
        "snapshots_total": 2,
        "snapshots_per_page_min": [1, 1],
        "min_user_actions": 6,
        "expected_action_types": {"click", "type"},
        "min_interacted": 5,
    },
    "testmapsite": {
        "report_file": (
            "testmapsite.spec.cy.ts/chrome/"
            "TestMap-Early-Access-signup-clicks-the-Sign-up-for-Early-Access-button.json"
        ),
        "label": "TestMap Early Access",
        "site": "testmap.io",
        "pages": {
            "count": 2,
            "hrefs_contain": ["testmap.io"],
        },
        "snapshots_total_range": (2, 3),
        "snapshots_per_page_min": None,
        "min_user_actions": 1,
        "expected_action_types": {"click"},
        "min_interacted": 1,
    },
}


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------


def load_report(report_file: str) -> dict[str, Any] | None:
    """Загружает JSON отчет."""
    path = REPORT_DIR / report_file
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def count_raw_sessions(events: list[dict]) -> int:
    """Считает уникальные checkout_id."""
    cids = {e.get("checkoutId") for e in events if e.get("checkoutId") is not None}
    return len(cids)


def count_raw_event_types(events: list[dict]) -> dict[int, int]:
    """Считает количество событий по типу."""
    counts: dict[int, int] = {}
    for e in events:
        t = e.get("type")
        counts[t] = counts.get(t, 0) + 1
    return counts


def get_raw_hrefs(events: list[dict]) -> list[str]:
    """Извлекает уникальные href из META событий."""
    hrefs = []
    seen = set()
    for e in events:
        if e.get("type") == 4 and isinstance(e.get("data"), dict):
            href = e["data"].get("href", "")
            if href and href not in seen:
                hrefs.append(href)
                seen.add(href)
    return hrefs


def count_incremental_sources(events: list[dict]) -> dict[int, int]:
    """Считает IncrementalSnapshot события по source."""
    counts: dict[int, int] = {}
    for e in events:
        if e.get("type") == 3 and isinstance(e.get("data"), dict):
            source = e["data"].get("source")
            if source is not None:
                counts[source] = counts.get(source, 0) + 1
    return counts


# Названия IncrementalSource для читаемости
INCREMENTAL_SOURCE_NAMES = {
    0: "MUTATION",
    1: "MOUSE_MOVE",
    2: "MOUSE_INTERACTION",
    3: "SCROLL",
    4: "VIEWPORT_RESIZE",
    5: "INPUT",
    6: "TOUCH_MOVE",
    7: "MEDIA_INTERACTION",
    8: "STYLE_SHEET",
    9: "CANVAS_MUTATION",
    10: "FONT",
    11: "LOG",
    12: "DRAG",
    13: "STYLE_DECLARATION",
    14: "SELECTION",
    15: "ADOPT_STYLE_SHEET",
    16: "CUSTOM_ELEMENT",
    100: "VISIBILITY_MUTATION",
}


# ---------------------------------------------------------------------------
# Обработка через backend
# ---------------------------------------------------------------------------


def process_report(raw_data: dict[str, Any]) -> Report:
    """Обрабатывает отчет через backend Report.from_raw()."""
    return Report.from_raw(raw_data)


def extract_action_summary(report: Report) -> dict[str, Any]:
    """Извлекает сводку по действиям из обработанного отчета."""
    all_user_actions = []
    all_test_actions = []
    all_system_actions = []

    for page in report.pages:
        for snap in page.snapshots:
            for action in snap.actions:
                if action.kind == ActionKind.USER:
                    all_user_actions.append(action)
                elif action.kind == ActionKind.TEST:
                    all_test_actions.append(action)
                elif action.kind == ActionKind.SYSTEM:
                    all_system_actions.append(action)

    user_action_types = Counter(a.action for a in all_user_actions)
    return {
        "user_total": len(all_user_actions),
        "test_total": len(all_test_actions),
        "system_total": len(all_system_actions),
        "user_action_types": dict(user_action_types),
    }


# ---------------------------------------------------------------------------
# Сравнение и поиск расхождений
# ---------------------------------------------------------------------------

SEVERITY_ERROR = "ОШИБКА"
SEVERITY_WARN = "ВНИМАНИЕ"
SEVERITY_INFO = "ИНФО"


def compare(test_name: str, expected: dict, report: Report, raw_data: dict) -> list[dict]:
    """Сравнивает ожидаемое с фактическим. Возвращает список расхождений."""
    issues: list[dict] = []
    events = raw_data.get("events", [])

    # --- Страницы ---
    exp_pages = expected["pages"]["count"]
    act_pages = len(report.pages)
    if act_pages != exp_pages:
        issues.append({
            "severity": SEVERITY_ERROR,
            "field": "Кол-во страниц",
            "expected": exp_pages,
            "actual": act_pages,
        })

    # Проверка href
    act_hrefs = [p.href for p in report.pages]
    for pattern in expected["pages"]["hrefs_contain"]:
        if not any(pattern in h for h in act_hrefs):
            issues.append({
                "severity": SEVERITY_ERROR,
                "field": f"Страница с '{pattern}'",
                "expected": "Присутствует",
                "actual": f"Нет среди {act_hrefs}",
            })

    # --- Снапшоты ---
    act_snaps = sum(len(p.snapshots) for p in report.pages)
    if "snapshots_total" in expected:
        exp_snaps = expected["snapshots_total"]
        if act_snaps != exp_snaps:
            issues.append({
                "severity": SEVERITY_WARN,
                "field": "Кол-во снапшотов",
                "expected": exp_snaps,
                "actual": act_snaps,
            })
    elif "snapshots_total_range" in expected:
        lo, hi = expected["snapshots_total_range"]
        if not (lo <= act_snaps <= hi):
            issues.append({
                "severity": SEVERITY_WARN,
                "field": "Кол-во снапшотов",
                "expected": f"{lo}-{hi}",
                "actual": act_snaps,
            })

    # --- User actions ---
    action_summary = extract_action_summary(report)
    act_user = action_summary["user_total"]
    exp_min_user = expected.get("min_user_actions", 0)
    if act_user < exp_min_user:
        issues.append({
            "severity": SEVERITY_WARN,
            "field": "User-действия (мин.)",
            "expected": f">= {exp_min_user}",
            "actual": act_user,
        })

    # Типы действий
    exp_action_types = expected.get("expected_action_types", set())
    act_action_types = set(action_summary["user_action_types"].keys())
    missing_types = exp_action_types - act_action_types
    if missing_types:
        issues.append({
            "severity": SEVERITY_WARN,
            "field": "Отсутствующие типы действий",
            "expected": ", ".join(sorted(exp_action_types)),
            "actual": f"Нет: {', '.join(sorted(missing_types))}; Есть: {', '.join(sorted(act_action_types))}",
        })

    # --- Interacted elements ---
    total_interacted = 0
    for page in report.pages:
        if page.stats:
            total_interacted += page.stats.interacted
    exp_min_interacted = expected.get("min_interacted", 0)
    if total_interacted < exp_min_interacted:
        issues.append({
            "severity": SEVERITY_WARN,
            "field": "Interacted элементы (мин.)",
            "expected": f">= {exp_min_interacted}",
            "actual": total_interacted,
        })

    return issues


# ---------------------------------------------------------------------------
# Рендер таблиц
# ---------------------------------------------------------------------------


def render_raw_summary(test_name: str, label: str, raw_data: dict) -> None:
    """Выводит сводку по сырым данным (до обработки backend)."""
    events = raw_data.get("events", [])
    event_types = count_raw_event_types(events)
    sessions = count_raw_sessions(events)
    hrefs = get_raw_hrefs(events)

    table = Table(title=f"[bold]{label}[/] — Сырые данные", show_lines=True)
    table.add_column("Метрика", style="cyan", width=25)
    table.add_column("Значение", style="white")

    table.add_row("Всего событий", str(len(events)))
    table.add_row("FullSnapshot (type=2)", str(event_types.get(2, 0)))
    table.add_row("META (type=4)", str(event_types.get(4, 0)))
    table.add_row("IncrementalSnapshot (type=3)", str(event_types.get(3, 0)))
    table.add_row("Custom (type=5)", str(event_types.get(5, 0)))
    table.add_row("Сессии (checkout_id)", str(sessions))
    table.add_row("Уникальные hrefs", "\n".join(hrefs) if hrefs else "—")

    # Breakdown IncrementalSnapshot sources
    inc_sources = count_incremental_sources(raw_data.get("events", []))
    source_lines = []
    for src_id, cnt in sorted(inc_sources.items()):
        name = INCREMENTAL_SOURCE_NAMES.get(src_id, f"UNKNOWN({src_id})")
        source_lines.append(f"  {name} (src={src_id}): {cnt}")
    table.add_row("Incremental sources", "\n".join(source_lines) if source_lines else "—")

    console.print(table)
    console.print()


def render_backend_detail(test_name: str, label: str, report: Report) -> None:
    """Детальная таблица после обработки backend."""
    table = Table(
        title=f"[bold]{label}[/] — Backend обработка (по страницам/снапшотам)",
        show_lines=True,
    )
    table.add_column("Страница", style="cyan", width=50)
    table.add_column("Снап.", style="white", justify="center", width=6)
    table.add_column("Элем.", style="white", justify="right", width=7)
    table.add_column("Видим.", style="green", justify="right", width=7)
    table.add_column("Интерак.", style="yellow", justify="right", width=8)
    table.add_column("Протест.", style="magenta", justify="right", width=8)
    table.add_column("V+I", style="blue", justify="right", width=6)
    table.add_column("V+I+T", style="red", justify="right", width=6)

    for page in report.pages:
        s = page.stats
        table.add_row(
            page.href[:50],
            str(len(page.snapshots)),
            str(s.total) if s else "—",
            str(s.visible) if s else "—",
            str(s.interactive_total) if s else "—",
            str(s.interacted) if s else "—",
            str(s.visible_interactive) if s else "—",
            str(s.visible_interactive_interacted) if s else "—",
        )

    # Итого
    if report.stats:
        rs = report.stats
        table.add_row(
            "[bold]ИТОГО[/]",
            str(sum(len(p.snapshots) for p in report.pages)),
            f"[bold]{rs.total}[/]",
            f"[bold]{rs.visible}[/]",
            f"[bold]{rs.interactive_total}[/]",
            f"[bold]{rs.interacted}[/]",
            f"[bold]{rs.visible_interactive}[/]",
            f"[bold]{rs.visible_interactive_interacted}[/]",
        )

    console.print(table)
    console.print()


def render_snapshot_detail(test_name: str, label: str, report: Report) -> None:
    """Детальная таблица по снапшотам."""
    table = Table(
        title=f"[bold]{label}[/] — Детали по снапшотам",
        show_lines=True,
    )
    table.add_column("Страница", style="cyan", width=35)
    table.add_column("Snap#", style="white", justify="center", width=6)
    table.add_column("Элем.", justify="right", width=7)
    table.add_column("Видим.", justify="right", width=7)
    table.add_column("Интер.", justify="right", width=7)
    table.add_column("Протест.", justify="right", width=8)
    table.add_column("USER-действия", style="yellow", width=30)

    for page in report.pages:
        for snap in page.snapshots:
            user_actions = [a for a in snap.actions if a.kind == ActionKind.USER]
            action_types = Counter(a.action for a in user_actions)
            action_str = ", ".join(f"{k}:{v}" for k, v in sorted(action_types.items()))

            s = snap.stats
            table.add_row(
                page.href[:35],
                str(snap.index),
                str(s.total) if s else "—",
                str(s.visible) if s else "—",
                str(s.interactive_total) if s else "—",
                str(s.interacted) if s else "—",
                action_str or "—",
            )

    console.print(table)
    console.print()


def render_action_inventory(test_name: str, label: str, report: Report) -> None:
    """Инвентаризация всех действий."""
    table = Table(
        title=f"[bold]{label}[/] — Инвентаризация действий",
        show_lines=True,
    )
    table.add_column("Тип", style="cyan", width=8)
    table.add_column("Действие", style="white", width=20)
    table.add_column("Кол-во", justify="right", width=8)

    user_actions = []
    test_actions = []
    system_actions = []

    for page in report.pages:
        for snap in page.snapshots:
            for a in snap.actions:
                if a.kind == ActionKind.USER:
                    user_actions.append(a)
                elif a.kind == ActionKind.TEST:
                    test_actions.append(a)
                elif a.kind == ActionKind.SYSTEM:
                    system_actions.append(a)

    for label_kind, actions in [
        ("USER", user_actions),
        ("TEST", test_actions),
        ("SYSTEM", system_actions),
    ]:
        counts = Counter(a.action for a in actions)
        for action_name, cnt in sorted(counts.items()):
            table.add_row(label_kind, action_name, str(cnt))

    console.print(table)
    console.print()


def render_discrepancies(issues: list[dict], test_label: str) -> None:
    """Выводит найденные расхождения."""
    if not issues:
        console.print(
            Panel(
                "[green]Расхождений не обнаружено[/]",
                title=f"{test_label} — Проверка",
                border_style="green",
            )
        )
        return

    table = Table(show_lines=True)
    table.add_column("Уровень", width=10)
    table.add_column("Поле", width=30)
    table.add_column("Ожидалось", width=25)
    table.add_column("Фактически", width=35)

    for issue in issues:
        severity = issue["severity"]
        style = (
            "red" if severity == SEVERITY_ERROR
            else "yellow" if severity == SEVERITY_WARN
            else "blue"
        )
        table.add_row(
            Text(severity, style=style),
            str(issue["field"]),
            str(issue["expected"]),
            str(issue["actual"]),
        )

    console.print(
        Panel(
            table,
            title=f"{test_label} — Расхождения",
            border_style="red" if any(i["severity"] == SEVERITY_ERROR for i in issues) else "yellow",
        )
    )
    console.print()


def render_summary_table(results: dict[str, dict]) -> None:
    """Сводная таблица по всем тестам."""
    table = Table(
        title="[bold]СВОДНАЯ ТАБЛИЦА — Все тесты[/]",
        show_lines=True,
    )
    table.add_column("Тест", style="cyan", width=25)
    table.add_column("Стр.", justify="center", width=5)
    table.add_column("Снап.", justify="center", width=6)
    table.add_column("Элем.", justify="right", width=7)
    table.add_column("Видим.", justify="right", width=7)
    table.add_column("Интер.", justify="right", width=7)
    table.add_column("Протест.", justify="right", width=8)
    table.add_column("User Acts", justify="right", width=10)
    table.add_column("Coverage%", justify="right", width=10)
    table.add_column("Статус", justify="center", width=10)

    for test_name, res in results.items():
        report = res.get("report")
        issues = res.get("issues", [])
        label = EXPECTED[test_name]["label"]

        if report is None:
            table.add_row(label, "—", "—", "—", "—", "—", "—", "—", "—", "[red]НЕТ ФАЙЛА[/]")
            continue

        rs = report.stats
        snaps = sum(len(p.snapshots) for p in report.pages)
        action_summary = res.get("action_summary", {})
        user_total = action_summary.get("user_total", 0)

        # Coverage: visible_interactive_interacted / visible_interactive
        vi = rs.visible_interactive if rs else 0
        vii = rs.visible_interactive_interacted if rs else 0
        coverage = f"{(vii / vi * 100):.1f}%" if vi > 0 else "—"

        has_errors = any(i["severity"] == SEVERITY_ERROR for i in issues)
        has_warnings = any(i["severity"] == SEVERITY_WARN for i in issues)
        status = (
            "[red]ОШИБКА[/]" if has_errors
            else "[yellow]ВНИМАНИЕ[/]" if has_warnings
            else "[green]OK[/]"
        )

        table.add_row(
            label,
            str(len(report.pages)),
            str(snaps),
            str(rs.total) if rs else "—",
            str(rs.visible) if rs else "—",
            str(rs.interactive_total) if rs else "—",
            str(rs.interacted) if rs else "—",
            str(user_total),
            coverage,
            status,
        )

    console.print(table)
    console.print()


# ---------------------------------------------------------------------------
# Финальное ревью
# ---------------------------------------------------------------------------


def render_final_review(results: dict[str, dict]) -> None:
    """Финальное ревью с анализом расхождений."""
    all_issues = []
    for test_name, res in results.items():
        label = EXPECTED[test_name]["label"]
        for issue in res.get("issues", []):
            all_issues.append({**issue, "test": label})

    if not all_issues:
        console.print(
            Panel(
                "[bold green]Все тесты прошли проверку без расхождений![/]",
                title="ФИНАЛЬНОЕ РЕВЬЮ",
                border_style="green",
            )
        )
        return

    errors = [i for i in all_issues if i["severity"] == SEVERITY_ERROR]
    warnings = [i for i in all_issues if i["severity"] == SEVERITY_WARN]
    infos = [i for i in all_issues if i["severity"] == SEVERITY_INFO]

    lines = []
    lines.append(f"Всего расхождений: {len(all_issues)}")
    lines.append(f"  {SEVERITY_ERROR}: {len(errors)}")
    lines.append(f"  {SEVERITY_WARN}: {len(warnings)}")
    lines.append(f"  {SEVERITY_INFO}: {len(infos)}")
    lines.append("")

    if errors:
        lines.append("[bold red]Критические проблемы:[/]")
        for e in errors:
            lines.append(f"  [{e['test']}] {e['field']}: ожидалось {e['expected']}, получено {e['actual']}")
        lines.append("")

    if warnings:
        lines.append("[bold yellow]Предупреждения:[/]")
        for w in warnings:
            lines.append(f"  [{w['test']}] {w['field']}: ожидалось {w['expected']}, получено {w['actual']}")
        lines.append("")

    # Рекомендации по поиску причин
    # Проверяем конкретные паттерны расхождений
    missing_type_issues = [
        i for i in all_issues
        if "Отсутствующие типы действий" in str(i.get("field", ""))
        and "type" in str(i.get("actual", ""))
    ]
    if missing_type_issues:
        lines.append("[bold]Рекомендация — Отсутствие INPUT событий:[/]")
        lines.append("  Тесты с cy.type() не генерируют IncrementalSource.INPUT (source=5).")
        lines.append("  Возможные причины:")
        lines.append("  1. packages/rrweb/src/record/observer.ts — input observer не перехватывает")
        lines.append("     события, инициированные Cypress cy.type()")
        lines.append("  2. Конфигурация sampling.input: 'last' может отфильтровывать события")
        lines.append("  3. cy.type() использует keyboard events, а не нативный input event")
        lines.append("  Файлы для исследования:")
        lines.append("  - packages/rrweb/src/record/observer.ts (initInputObserver)")
        lines.append("  - packages/rrweb-cypress-plugin/src/recorder/RRWebRecorder.ts (defaultRecordOptions)")
        lines.append("")

    snap_issues = [
        i for i in all_issues if "снапшот" in str(i.get("field", "")).lower()
    ]
    if snap_issues:
        lines.append("[bold]Рекомендация — Расхождение числа снапшотов:[/]")
        lines.append("  checkoutEveryNvm: 60 вызывает дополнительные FullSnapshot при")
        lines.append("  большом количестве DOM-мутаций (анимации, lazy load, etc).")
        lines.append("  Файлы для исследования:")
        lines.append("  - packages/rrweb/src/record/index.ts (checkout trigger)")
        lines.append("")

    border = "red" if errors else "yellow"
    console.print(Panel("\n".join(lines), title="ФИНАЛЬНОЕ РЕВЬЮ", border_style=border))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    console.print(
        Panel(
            "[bold]Комплексный анализ Cypress тестов booking-demo[/]\n"
            "Обработка через backend ui_report модуль",
            border_style="blue",
        )
    )
    console.print()

    results: dict[str, dict] = {}

    for test_name, expected in EXPECTED.items():
        label = expected["label"]
        console.rule(f"[bold cyan]{label}[/] ({test_name})")
        console.print()

        # 1. Загрузка сырых данных
        raw_data = load_report(expected["report_file"])
        if raw_data is None:
            console.print(f"[red]Файл не найден: {expected['report_file']}[/]")
            results[test_name] = {"report": None, "issues": [{"severity": SEVERITY_ERROR, "field": "Файл отчета", "expected": "Существует", "actual": "Не найден"}]}
            console.print()
            continue

        # 2. Сводка по сырым данным
        render_raw_summary(test_name, label, raw_data)

        # 3. Обработка через backend
        try:
            report = process_report(raw_data)
        except Exception as e:
            console.print(f"[red]Ошибка обработки backend: {e}[/]")
            results[test_name] = {"report": None, "issues": [{"severity": SEVERITY_ERROR, "field": "Backend обработка", "expected": "Успех", "actual": str(e)}]}
            console.print()
            continue

        # 4. Детали по страницам
        render_backend_detail(test_name, label, report)

        # 5. Детали по снапшотам
        render_snapshot_detail(test_name, label, report)

        # 6. Инвентаризация действий
        render_action_inventory(test_name, label, report)

        # 7. Сравнение ожидаемого и фактического
        action_summary = extract_action_summary(report)
        issues = compare(test_name, expected, report, raw_data)
        render_discrepancies(issues, label)

        results[test_name] = {
            "report": report,
            "issues": issues,
            "action_summary": action_summary,
        }

    # 8. Сводная таблица
    console.print()
    console.rule("[bold]СВОДНАЯ ТАБЛИЦА[/]")
    console.print()
    render_summary_table(results)

    # 9. Финальное ревью
    render_final_review(results)


if __name__ == "__main__":
    main()
