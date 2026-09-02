#!/usr/bin/env python3
"""Genera la guida PDF per la preparazione dei file CAD Filippucci."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "document/dxf/Guida-preparazione-file-CAD-Filippucci.md"
OUTPUT = ROOT / "document/dxf/Guida-preparazione-file-CAD-Filippucci.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
INK = colors.HexColor("#162127")
INK_SOFT = colors.HexColor("#26343A")
LIME = colors.HexColor("#C6FF00")
LIME_PALE = colors.HexColor("#F0F8D8")
RED = colors.HexColor("#E5092F")
TEXT = colors.HexColor("#263238")
MUTED = colors.HexColor("#64747A")
LINE = colors.HexColor("#D8E0E2")
WHITE = colors.white


def register_fonts() -> tuple[str, str, str]:
    """Registra un font con supporto per gli accenti italiani."""

    regular = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    italic = Path("/System/Library/Fonts/Supplemental/Arial Italic.ttf")

    if regular.exists() and bold.exists() and italic.exists():
        pdfmetrics.registerFont(TTFont("FilippucciArial", str(regular)))
        pdfmetrics.registerFont(TTFont("FilippucciArial-Bold", str(bold)))
        pdfmetrics.registerFont(TTFont("FilippucciArial-Italic", str(italic)))
        return "FilippucciArial", "FilippucciArial-Bold", "FilippucciArial-Italic"

    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


REGULAR, BOLD, ITALIC = register_fonts()


def inline_markup(value: str) -> str:
    """Converte il piccolo sottoinsieme Markdown usato dalla guida in markup ReportLab."""

    code_tokens: list[str] = []

    def save_code(match: re.Match[str]) -> str:
        code_tokens.append(match.group(1))
        return f"@@CODE{len(code_tokens) - 1}@@"

    value = re.sub(r"`([^`]+)`", save_code, value)
    value = html.escape(value, quote=False)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", value)

    for index, code in enumerate(code_tokens):
        safe_code = html.escape(code, quote=False)
        value = value.replace(
            f"@@CODE{index}@@",
            f'<font name="Courier" color="#35515A">{safe_code}</font>',
        )
    return value


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()["Normal"]
    return {
        "body": ParagraphStyle(
            "Body",
            parent=base,
            fontName=REGULAR,
            fontSize=9.4,
            leading=13.1,
            textColor=TEXT,
            spaceAfter=6,
            alignment=TA_LEFT,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base,
            fontName=REGULAR,
            fontSize=8,
            leading=10.5,
            textColor=MUTED,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "Heading1",
            parent=base,
            fontName=BOLD,
            fontSize=16,
            leading=20,
            textColor=INK,
            spaceBefore=9,
            spaceAfter=8,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base,
            fontName=BOLD,
            fontSize=11.8,
            leading=15,
            textColor=INK_SOFT,
            spaceBefore=8,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base,
            fontName=REGULAR,
            fontSize=9.3,
            leading=12.8,
            textColor=TEXT,
            leftIndent=14,
            firstLineIndent=-9,
            spaceAfter=3,
        ),
        "number": ParagraphStyle(
            "Number",
            parent=base,
            fontName=REGULAR,
            fontSize=9.3,
            leading=12.8,
            textColor=TEXT,
            leftIndent=18,
            firstLineIndent=-15,
            spaceAfter=3,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base,
            fontName=REGULAR,
            fontSize=9.5,
            leading=13.2,
            textColor=INK,
            leftIndent=3,
            rightIndent=3,
            spaceAfter=0,
        ),
        "cover-kicker": ParagraphStyle(
            "CoverKicker",
            parent=base,
            fontName=BOLD,
            fontSize=8.3,
            leading=10,
            textColor=LIME,
            tracking=1.2,
            spaceAfter=13,
        ),
        "cover-title": ParagraphStyle(
            "CoverTitle",
            parent=base,
            fontName=BOLD,
            fontSize=30,
            leading=33,
            textColor=WHITE,
            spaceAfter=13,
        ),
        "cover-subtitle": ParagraphStyle(
            "CoverSubtitle",
            parent=base,
            fontName=REGULAR,
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#DCE7E9"),
            spaceAfter=18,
        ),
        "cover-body": ParagraphStyle(
            "CoverBody",
            parent=base,
            fontName=REGULAR,
            fontSize=10.1,
            leading=14.2,
            textColor=colors.HexColor("#F4F8F8"),
            spaceAfter=4,
        ),
        "cover-meta": ParagraphStyle(
            "CoverMeta",
            parent=base,
            fontName=REGULAR,
            fontSize=8.2,
            leading=11,
            textColor=colors.HexColor("#A9B9BD"),
        ),
        "table": ParagraphStyle(
            "Table",
            parent=base,
            fontName=REGULAR,
            fontSize=7.8,
            leading=10.1,
            textColor=TEXT,
        ),
        "table-head": ParagraphStyle(
            "TableHead",
            parent=base,
            fontName=BOLD,
            fontSize=7.9,
            leading=10.2,
            textColor=WHITE,
        ),
    }


def is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def markdown_table(lines: list[str], styles: dict[str, ParagraphStyle]) -> Table:
    raw_rows = []
    for line in lines:
        if is_table_separator(line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        raw_rows.append(cells)

    column_count = max(len(row) for row in raw_rows)
    normalized = [row + [""] * (column_count - len(row)) for row in raw_rows]
    data = []
    for row_index, row in enumerate(normalized):
        style = styles["table-head"] if row_index == 0 else styles["table"]
        data.append([Paragraph(inline_markup(cell), style) for cell in row])

    if column_count == 4:
        widths = [2.45 * cm, 2.15 * cm, 6.25 * cm, 6.25 * cm]
    else:
        widths = [17.1 * cm / column_count] * column_count

    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("GRID", (0, 0), (-1, -1), 0.35, LINE),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9F9")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def callout(text: str, styles: dict[str, ParagraphStyle]) -> Table:
    box = Table([[Paragraph(inline_markup(text), styles["callout"])]], colWidths=[17.1 * cm])
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIME_PALE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D4E68B")),
                ("LINEBEFORE", (0, 0), (0, -1), 4, LIME),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return box


def layer_stack(styles: dict[str, ParagraphStyle]) -> Table:
    rows = [
        ("FP_WALLS", "Muri e divisori", colors.HexColor("#33454D")),
        ("FP_DOORS", "Porte e aperture", colors.HexColor("#B52A42")),
        ("FP_WINDOWS", "Finestre", colors.HexColor("#2A7F9E")),
        ("FP_ROOMS", "Polilinee chiuse delle stanze", colors.HexColor("#628B2C")),
        ("FP_OBJECTS", "Arredi selezionabili", colors.HexColor("#B47719")),
        ("FP_NOTES", "Quote e annotazioni", colors.HexColor("#77858A")),
    ]
    data = []
    for name, description, color in rows:
        name_paragraph = Paragraph(
            f'<font color="#162127"><b>{name}</b></font>', styles["table"]
        )
        data.append([name_paragraph, Paragraph(description, styles["table"])])
    table = Table(data, colWidths=[3.25 * cm, 13.85 * cm], hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for index, (_, _, color) in enumerate(rows):
        commands.append(("BACKGROUND", (0, index), (0, index), color))
        commands.append(("TEXTCOLOR", (0, index), (0, index), WHITE))
    table.setStyle(TableStyle(commands))
    return table


def cover_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(INK)
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(RED)
    canvas.rect(0, PAGE_HEIGHT - 9 * mm, PAGE_WIDTH, 9 * mm, fill=1, stroke=0)
    canvas.setFillColor(LIME)
    canvas.rect(20 * mm, 33 * mm, 18 * mm, 2.2 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#5A6A70"))
    canvas.setFont(REGULAR, 7.5)
    canvas.drawRightString(PAGE_WIDTH - 20 * mm, 33 * mm, "DOCUMENTO OPERATIVO • VERSIONE 1.0")
    canvas.restoreState()


def regular_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(LIME)
    canvas.setLineWidth(2)
    canvas.line(20 * mm, PAGE_HEIGHT - 14 * mm, 40 * mm, PAGE_HEIGHT - 14 * mm)
    canvas.setFillColor(INK)
    canvas.setFont(BOLD, 7.4)
    canvas.drawString(45 * mm, PAGE_HEIGHT - 14.9 * mm, "FILIPPUCCI INTERIOR • PREPARAZIONE FILE CAD")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, 16 * mm, PAGE_WIDTH - 20 * mm, 16 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont(REGULAR, 7.4)
    canvas.drawString(20 * mm, 10.5 * mm, "Standard CAD v1.0 • 2 settembre 2026")
    canvas.drawRightString(PAGE_WIDTH - 20 * mm, 10.5 * mm, f"Pagina {doc.page}")
    canvas.restoreState()


def build_story(source: str) -> list:
    styles = make_styles()
    lines = source.splitlines()
    story = [
        Spacer(1, 17 * mm),
        Paragraph("FILIPPUCCI • HOME DESIGN", styles["cover-kicker"]),
        Paragraph("Preparazione<br/>file CAD", styles["cover-title"]),
        Paragraph(
            "Guida operativa per la consegna di planimetrie, aperture, stanze e arredi selezionabili.",
            styles["cover-subtitle"],
        ),
        Table(
            [[
                Paragraph(
                    "Un file CAD ben preparato non deve contenere più lavoro: deve contenere le informazioni giuste, organizzate in modo leggibile dall’applicazione.",
                    styles["cover-body"],
                )
            ]],
            colWidths=[15.9 * cm],
            style=TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#5D7379")),
                    ("LINEBEFORE", (0, 0), (0, -1), 4, LIME),
                    ("LEFTPADDING", (0, 0), (-1, -1), 11),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            ),
        ),
        Spacer(1, 19 * mm),
        Paragraph("STANDARD MINIMO", styles["cover-kicker"]),
        Paragraph(
            "Sei livelli. Nessun livello per ogni stanza. Un blocco per ogni prodotto che l’utente deve poter selezionare.",
            styles["cover-body"],
        ),
        Spacer(1, 8 * mm),
        Paragraph("Versione 1.0 • pensata per demo e flusso futuro dei geometri", styles["cover-meta"]),
        PageBreak(),
    ]

    start = next((index for index, line in enumerate(lines) if line.startswith("### Obiettivo")), 0)
    body_lines = lines[start:]
    index = 0
    major_sections = 0
    while index < len(body_lines):
        line = body_lines[index].strip()
        if not line:
            index += 1
            continue

        if line.startswith("## "):
            major_sections += 1
            story.append(Paragraph(inline_markup(line[3:]), styles["h1"]))
            if line.startswith("## 1. "):
                story.append(layer_stack(styles))
                story.append(Spacer(1, 7))
            index += 1
            continue

        if line.startswith("### "):
            story.append(Paragraph(inline_markup(line[4:]), styles["h2"]))
            index += 1
            continue

        if line.startswith("> "):
            story.append(callout(line[2:], styles))
            story.append(Spacer(1, 7))
            index += 1
            continue

        if line.startswith("|"):
            table_lines = []
            while index < len(body_lines) and body_lines[index].strip().startswith("|"):
                table_lines.append(body_lines[index].strip())
                index += 1
            story.append(KeepTogether([markdown_table(table_lines, styles), Spacer(1, 8)]))
            continue

        if line.startswith("- "):
            while index < len(body_lines) and body_lines[index].strip().startswith("- "):
                item = body_lines[index].strip()[2:]
                if item.startswith("[ ] "):
                    item = "[ ] " + item[4:]
                elif item.startswith("[x] ") or item.startswith("[X] "):
                    item = "[x] " + item[4:]
                story.append(Paragraph(f"• {inline_markup(item)}", styles["bullet"]))
                index += 1
            story.append(Spacer(1, 2))
            continue

        if re.match(r"^\d+\. ", line):
            while index < len(body_lines) and re.match(r"^\d+\. ", body_lines[index].strip()):
                item = body_lines[index].strip()
                story.append(Paragraph(inline_markup(item), styles["number"]))
                index += 1
            story.append(Spacer(1, 2))
            continue

        paragraph_lines = [line]
        index += 1
        while index < len(body_lines):
            next_line = body_lines[index].strip()
            if (
                not next_line
                or next_line.startswith(("#", "> ", "|", "- "))
                or re.match(r"^\d+\. ", next_line)
            ):
                break
            paragraph_lines.append(next_line)
            index += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))

    return story


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    story = build_story(source)
    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=22 * mm,
        title="Filippucci Interior — Guida preparazione file CAD",
        author="Filippucci Home Design",
        subject="Standard operativo per la preparazione dei file CAD",
    )
    document.build(story, onFirstPage=cover_page, onLaterPages=regular_page)
    print(f"PDF_GENERATED {OUTPUT} ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
