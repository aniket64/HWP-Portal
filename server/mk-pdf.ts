/**
 * Mehrkosten-Antrag PDF-Generator
 * Klassisches Rechnungslayout: saubere Tabelle, korrekte Spaltenbreiten,
 * Pauschalen-Zeile, Summenblock.
 */
import PDFDocument from "pdfkit";
import type { MkRechnung, MkPosition, MkNachtrag } from "../drizzle/schema";

// ─── Typen ────────────────────────────────────────────────────────────────────
export interface MkAntragPdfData {
  rechnung: MkRechnung;
  positionen: MkPosition[];
  nachtraege: MkNachtrag[];
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────
function euro(value: number): string {
  // Werte sind bereits in Euro (ganzzahlig), keine Cent-Umrechnung nötig
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " €";
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

const NACHTRAG_STATUS: Record<string, string> = {
  offen: "Offen – wird geprüft",
  freigegeben: "Freigegeben",
  abgelehnt: "Abgelehnt",
};

// ─── Seitenmaße (A4) ─────────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 50;   // margin left
const MR = 50;   // margin right
const CW = PAGE_W - ML - MR;  // content width = 495.28

// ─── Tabellenspalten (absolute X-Koordinaten, Summe = CW) ────────────────────
// | Position (Label)  | Einheit | Menge | Einzelpreis | Gesamtpreis |
// | 240               | 55      | 50    | 75          | 75          | = 495
const COL = {
  pos:   { x: ML,           w: 240 },
  unit:  { x: ML + 240,     w: 55  },
  qty:   { x: ML + 295,     w: 50  },
  ep:    { x: ML + 345,     w: 75  },
  gp:    { x: ML + 420,     w: 75  },
};

// ─── Hauptfunktion ────────────────────────────────────────────────────────────
export function generateMkAntragPdf(data: MkAntragPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { rechnung, positionen, nachtraege } = data;
    const nachtrag = nachtraege[0] ?? null;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: ML, bottom: 35, left: ML, right: MR },
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: `Mehrkosten-Antrag ${rechnung.orderNumber}`,
        Author: "HWP Partner Portal",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Cursor-Tracking ──────────────────────────────────────────────────────
    let y = ML;

    function ensureSpace(needed: number) {
      if (y + needed > PAGE_H - 60) {
        doc.addPage();
        y = ML;
        drawTableHeader(); // Tabellenkopf auf neuer Seite wiederholen
      }
    }

    // ── Zeichenhilfen ────────────────────────────────────────────────────────
    function hline(yy: number, lw = 0.5, color = "#cccccc") {
      doc.save().strokeColor(color).lineWidth(lw)
        .moveTo(ML, yy).lineTo(ML + CW, yy).stroke().restore();
    }

    function rect(x: number, yy: number, w: number, h: number, fill: string) {
      doc.save().fillColor(fill).rect(x, yy, w, h).fill().restore();
    }

    function cell(
      txt: string,
      x: number,
      yy: number,
      w: number,
      opts: { size?: number; bold?: boolean; align?: "left" | "right" | "center"; color?: string } = {}
    ) {
      const { size = 9, bold = false, align = "left", color = "#222222" } = opts;
      doc.save()
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(color)
        .text(txt, x + (align === "right" ? 0 : 3), yy, {
          width: w - 3,
          align,
          lineBreak: false,
        })
        .restore();
    }

    // ── Tabellenkopf ────────────────────────────────────────────────────────
    function drawTableHeader() {
      const h = 16;
      rect(ML, y, CW, h, "#1e3a5f");
      cell("Position / Bezeichnung", COL.pos.x,  y + 4, COL.pos.w,  { bold: true, size: 8, color: "#ffffff" });
      cell("Einheit",                COL.unit.x, y + 4, COL.unit.w, { bold: true, size: 8, color: "#ffffff" });
      cell("Menge",                  COL.qty.x,  y + 4, COL.qty.w,  { bold: true, size: 8, color: "#ffffff", align: "right" });
      cell("Einzelpr.",              COL.ep.x,   y + 4, COL.ep.w,   { bold: true, size: 8, color: "#ffffff", align: "right" });
      cell("Gesamt",                 COL.gp.x,   y + 4, COL.gp.w,   { bold: true, size: 8, color: "#ffffff", align: "right" });
      y += h;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. KOPFZEILE
    // ═══════════════════════════════════════════════════════════════════════
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#1e3a5f")
      .text("Mehrkosten-Antrag", ML, y);
    y += 22;

    // Auftragsnummer + Status nebeneinander
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333")
      .text(rechnung.orderNumber, ML, y);

    const statusLabel = nachtrag
      ? (NACHTRAG_STATUS[nachtrag.status] ?? nachtrag.status)
      : "Kein Antrag";
    const statusColor = nachtrag?.status === "freigegeben" ? "#15803d"
      : nachtrag?.status === "abgelehnt" ? "#b91c1c"
      : "#92400e";
    doc.font("Helvetica").fontSize(9).fillColor(statusColor)
      .text(`Status: ${statusLabel}`, ML + CW - 180, y, { width: 180, align: "right" });
    y += 18;

    hline(y);
    y += 10;

    // ═══════════════════════════════════════════════════════════════════════
    // 2. STAMMDATEN (2 Spalten)
    // ═══════════════════════════════════════════════════════════════════════
    const halfW = CW / 2 - 10;
    const col2X = ML + CW / 2 + 10;

    function infoRow(label: string, value: string, cx: number, cy: number): number {
      doc.font("Helvetica").fontSize(8).fillColor("#888888").text(label, cx, cy, { width: halfW * 0.45, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#222222").text(value, cx + halfW * 0.45, cy, { width: halfW * 0.55, lineBreak: false });
      return cy + 13;
    }

    let ly = y;
    ly = infoRow("Auftragsnummer",   rechnung.orderNumber,         ML,    ly);
    ly = infoRow("Kunde",            rechnung.kundenName ?? "–",   ML,    ly);
    ly = infoRow("Handwerkspartner", rechnung.hwpName ?? "–",      ML,    ly);
    ly = infoRow("UV-Anzahl",        String(rechnung.uvAnzahl),    ML,    ly);
    ly = infoRow("Erstellt am",      fmtDate(rechnung.createdAt),  ML,    ly);

    let ry = y;
    if (nachtrag) {
      ry = infoRow("Eingereicht von", nachtrag.eingereichtVonName ?? "–", col2X, ry);
      ry = infoRow("Eingereicht am",  fmtDate(nachtrag.eingereichtAt),    col2X, ry);
      ry = infoRow("Status",          NACHTRAG_STATUS[nachtrag.status] ?? nachtrag.status, col2X, ry);
      if (nachtrag.geprueftVonName) {
        ry = infoRow("Geprüft von", nachtrag.geprueftVonName,         col2X, ry);
        ry = infoRow("Geprüft am",  fmtDate(nachtrag.geprueftAt),     col2X, ry);
      }
    }

    y = Math.max(ly, ry) + 12;

    // ═══════════════════════════════════════════════════════════════════════
    // 3. KOMMENTARE
    // ═══════════════════════════════════════════════════════════════════════
    if (nachtrag?.hwpKommentar) {
      hline(y);
      y += 8;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#555555").text("Kommentar des Handwerkspartners:", ML, y);
      y += 12;
      doc.fontSize(9);
    const komH = doc.heightOfString(nachtrag.hwpKommentar, { width: CW - 10 });
      rect(ML, y, CW, komH + 8, "#f7f7f7");
      doc.font("Helvetica").fontSize(9).fillColor("#222222")
        .text(nachtrag.hwpKommentar, ML + 5, y + 4, { width: CW - 10 });
      y += komH + 16;
    }

    if (nachtrag?.prueferKommentar) {
      hline(y);
      y += 8;
      const pcLabel = nachtrag.status === "abgelehnt" ? "Ablehnungsgrund:" : "Prüfer-Kommentar:";
      const pcColor = nachtrag.status === "abgelehnt" ? "#b91c1c" : "#15803d";
      doc.font("Helvetica-Bold").fontSize(8).fillColor(pcColor).text(pcLabel, ML, y);
      y += 12;
      doc.fontSize(9);
      const pcH = doc.heightOfString(nachtrag.prueferKommentar, { width: CW - 10 });
      const pcBg = nachtrag.status === "abgelehnt" ? "#fff5f5" : "#f0fdf4";
      rect(ML, y, CW, pcH + 8, pcBg);
      doc.font("Helvetica").fontSize(9).fillColor("#222222")
        .text(nachtrag.prueferKommentar, ML + 5, y + 4, { width: CW - 10 });
      y += pcH + 16;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. POSITIONEN-TABELLE
    // ═══════════════════════════════════════════════════════════════════════
    hline(y);
    y += 10;

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e3a5f").text("Positionen", ML, y);
    y += 14;

    drawTableHeader();

    const ROW_H = 16;
    let rowIdx = 0;

    for (const pos of positionen) {
      ensureSpace(ROW_H + 4);

      const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f5f5f5";
      rect(ML, y, CW, ROW_H, bg);

      // Label (Freitext mit Stern markiert)
      const label = pos.isFreitext ? `* ${pos.positionLabel}` : pos.positionLabel;
      cell(label, COL.pos.x, y + 4, COL.pos.w, { size: 8 });
      cell(pos.einheit, COL.unit.x, y + 4, COL.unit.w, { size: 8, color: "#666666" });

      // Menge: zeige Nettomenge + Pauschalen-Hinweis
      const nettoMenge = pos.nettomenge ?? pos.menge;
      const inPauschale = pos.pauschaleMenge > 0;
      const mengeStr = inPauschale
        ? `${nettoMenge} (+${pos.pauschaleMenge}P)`
        : String(pos.menge);
      cell(mengeStr, COL.qty.x, y + 4, COL.qty.w, {
        size: inPauschale ? 7 : 8,
        align: "right",
        color: inPauschale ? "#888888" : "#222222",
      });

      cell(euro(pos.einzelpreis), COL.ep.x, y + 4, COL.ep.w, { size: 8, align: "right" });

      // Gesamtpreis = Nettomenge × Einzelpreis
      const gp = nettoMenge * pos.einzelpreis;
      cell(euro(gp), COL.gp.x, y + 4, COL.gp.w, { size: 8, align: "right" });

      y += ROW_H;
      rowIdx++;
    }

    // Freitext-Legende (falls vorhanden)
    if (positionen.some(p => p.isFreitext)) {
      y += 4;
      doc.font("Helvetica").fontSize(7).fillColor("#888888")
        .text("* Freitext-Position (nicht im Standardkatalog)", ML, y);
      y += 12;
    }

    // Menge-Legende (falls Pauschalen-Positionen vorhanden)
    if (positionen.some(p => p.pauschaleMenge > 0)) {
      doc.font("Helvetica").fontSize(7).fillColor("#888888")
        .text("Menge: Nettomenge (+xP = x Einheiten durch Pauschale abgedeckt, nicht berechnet)", ML, y);
      y += 12;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. PAUSCHALEN-BLOCK
    // ═══════════════════════════════════════════════════════════════════════
    ensureSpace(80);
    y += 6;
    hline(y);
    y += 10;

    // Pauschalen-Info-Zeile
    const uvAnzahl = rechnung.uvAnzahl;
    const pauschaleBetrag = rechnung.pauschaleBetrag;

    rect(ML, y, CW, 14, "#efefef");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#555555")
      .text(`Pauschale (${uvAnzahl} UV)`, ML + 4, y + 3);
    doc.font("Helvetica").fontSize(8).fillColor("#555555")
      .text(
        `Aufwandspauschale für ${uvAnzahl} UV (inkl. Anfahrt, Montage, Materiallogistik)`,
        ML + 100, y + 3, { width: CW - 200 }
      );
    doc.font("Helvetica-Bold").fontSize(8).fillColor(pauschaleBetrag > 0 ? "#15803d" : "#888888")
      .text(pauschaleBetrag > 0 ? `+ ${euro(pauschaleBetrag)}` : `– 0,00 €`, ML + CW - 80, y + 3, { width: 76, align: "right" });
    y += 20;

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SUMMEN-BLOCK
    // ═══════════════════════════════════════════════════════════════════════
    ensureSpace(70);

    const sumLabelX = ML + CW - 220;
    const sumValX   = ML + CW - 100;
    const sumValW   = 96;

    function sumRow(label: string, value: string, bold = false, color = "#333333") {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#666666")
        .text(label, sumLabelX, y, { width: 116, lineBreak: false });
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(color)
        .text(value, sumValX, y, { width: sumValW, align: "right", lineBreak: false });
      y += 14;
    }

    hline(y);
    y += 8;

    const nettoMaterial = rechnung.summeMitPauschale - rechnung.pauschaleBetrag;
    sumRow("Netto-Material", euro(nettoMaterial));
    sumRow("+ Pauschale (" + rechnung.uvAnzahl + " UV)", pauschaleBetrag > 0 ? `+ ${euro(pauschaleBetrag)}` : `– 0,00 €`, false, pauschaleBetrag > 0 ? "#15803d" : "#888888");

    hline(y - 2, 1, "#1e3a5f");
    y += 4;

    rect(sumLabelX - 4, y, sumValW + 120 + 8, 20, "#e8eef5");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e3a5f")
      .text("GESAMTBETRAG MEHRKOSTEN", sumLabelX, y + 5, { width: 116, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a5f")
      .text(euro(rechnung.summeMitPauschale), sumValX, y + 4, { width: sumValW, align: "right", lineBreak: false });
    y += 28;

    // Freigegebener Betrag (falls vorhanden)
    if (nachtrag?.freigegebenerBetrag != null) {
      rect(sumLabelX - 4, y, sumValW + 120 + 8, 20, "#dcfce7");
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#15803d")
        .text("FREIGEGEBENER BETRAG", sumLabelX, y + 5, { width: 116, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#15803d")
        .text(euro(nachtrag.freigegebenerBetrag), sumValX, y + 4, { width: sumValW, align: "right", lineBreak: false });
      y += 28;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. FOOTER (auf jeder Seite via pageAdded + abschließend)
    // ═══════════════════════════════════════════════════════════════════════
    // Footer auf allen gepufferten Seiten zeichnen
    // footerY muss < page.maxY() liegen, damit pdfkit keine neue Seite erzeugt
    const range = doc.bufferedPageRange();
    const footerText = `Erstellt am ${new Date().toLocaleDateString("de-DE")} · HWP Partner Portal · Auftrag ${rechnung.orderNumber}`;
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const footerY = doc.page.maxY() - 15; // innerhalb des Inhaltsbereichs
      doc.save();
      doc.strokeColor("#cccccc").lineWidth(0.5)
        .moveTo(ML, footerY - 5).lineTo(ML + CW, footerY - 5).stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor("#aaaaaa")
        .text(footerText, ML, footerY, { width: CW, align: "center", lineBreak: false });
      doc.restore();
    }

    doc.flushPages();
    doc.end();
  });
}
