from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Meta", parent=styles["Normal"], fontSize=8, leading=11, textColor=HexColor("#5f687b")))
    styles.add(ParagraphStyle(name="Entry", parent=styles["BodyText"], fontSize=9, leading=13, spaceAfter=4))
    document = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=18 * mm)
    story = [
        Paragraph("Colegio sintético de validación", styles["Meta"]),
        Paragraph("Hoja de vida · Inclusión Educativa", styles["Title"]),
        Spacer(1, 4 * mm),
        Table([
            ["Alumno", "Valentina Soto (dato sintético)"],
            ["Período", "01-03-2026 al 22-09-2026"],
            ["Filtros", "Categoría: todas · anulados incluidos"],
            ["Generado", "22-09-2026 12:00 America/Santiago · usuario admin-sintético"],
        ], colWidths=[32 * mm, 124 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), HexColor("#f0f1f5")),
            ("TEXTCOLOR", (0, 0), (-1, -1), HexColor("#263149")),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#d7dce5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ])),
        Spacer(1, 7 * mm),
        Paragraph("Registros", styles["Heading2"]),
    ]
    entries = [
        ("14-09-2026 · 10:20 aprox. · OBSERVACIÓN", "Participación en actividad grupal", "Se registra una observación objetiva durante el trabajo de aula. La información fue presenciada por el equipo.", "Actuación inmediata: se ajustaron instrucciones y tiempo de respuesta.", "Autor original: profesional-sintético · Creado: 14-09-2026 11:02 · Curso del hecho: 6° A · Versiones: 1"),
        ("03-09-2026 · ENTREVISTA O REUNIÓN · ANULADO", "Reunión informada por tercero", "Antecedente sintético informado por docente de asignatura. Este registro se muestra sólo porque el filtro incluye anulados.", "Motivo de anulación: registro duplicado en validación sintética.", "Autor original: profesional-sintético-2 · Creado: 03-09-2026 16:40 · Curso del hecho: 6° A · Versiones: 2"),
    ]
    for heading, title, body, action, meta in entries:
        story.append(KeepTogether([
            Paragraph(heading, styles["Meta"]),
            Paragraph(title, styles["Heading3"]),
            Paragraph(body, styles["Entry"]),
            Paragraph(action, styles["Entry"]),
            Paragraph(meta, styles["Meta"]),
            Spacer(1, 5 * mm),
        ]))
    story.extend([
        Paragraph("Acciones relacionadas", styles["Heading2"]),
        Table([
            ["Acción", "Responsable", "Vencimiento", "Estado"],
            ["Coordinar adecuación de evaluación", "Miembro sintético", "25-09-2026", "EN CURSO"],
            ["Registrar seguimiento", "Miembro sintético 2", "15-09-2026", "VENCIDA"],
        ], colWidths=[72 * mm, 38 * mm, 26 * mm, 25 * mm], repeatRows=1, style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#1d2f70")),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#ffffff")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, HexColor("#d7dce5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("PADDING", (0, 0), (-1, -1), 6),
        ])),
        Spacer(1, 6 * mm),
        Paragraph("Adjuntos referenciados", styles["Heading2"]),
        Paragraph("• pauta-observacion.pdf · • imagen-contexto.png (los archivos no se incrustan)", styles["Entry"]),
        Spacer(1, 8 * mm),
        Paragraph("Documento generado para validación con información enteramente sintética. Exportación auditada y sujeta al mismo acceso DIE que la consulta.", styles["Meta"]),
    ])
    document.build(story)


if __name__ == "__main__":
    build(Path(__file__).resolve().parents[4] / "output" / "pdf" / "die-hoja-de-vida-sintetica.pdf")
