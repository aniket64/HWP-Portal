/**
 * Mehrkosten-Positionskatalog
 * Alle Materialien mit Einheit und Einzelpreis (in Euro, ganzzahlig)
 * Quelle: Screenshots der bestehenden Klassifizierungsmaske
 */

export type MkKatalogPosition = {
  key: string;
  label: string;
  einheit: "Meter" | "Menge";
  einzelpreisEuro: number;
  kategorie: "kabel" | "zaehler" | "uv" | "sonstiges";
};

export const MK_KATALOG: MkKatalogPosition[] = [
  // ─── Kabel ────────────────────────────────────────────────────────────────
  { key: "kabel_5x10",        label: "5x10mm Kabel",                    einheit: "Meter",  einzelpreisEuro: 10,  kategorie: "kabel" },
  { key: "kabel_5x16",        label: "5x16mm Kabel",                    einheit: "Meter",  einzelpreisEuro: 15,  kategorie: "kabel" },
  { key: "kabel_5x25",        label: "5x25mm Kabel",                    einheit: "Meter",  einzelpreisEuro: 20,  kategorie: "kabel" },
  { key: "kabel_nyy",         label: "Typ NYY (Erdkabel)",              einheit: "Meter",  einzelpreisEuro: 5,   kategorie: "kabel" },
  { key: "kabel_endstrom",    label: "Kabelverlängerung Endstromkreise",einheit: "Meter",  einzelpreisEuro: 5,   kategorie: "kabel" },
  { key: "kabel_unterputz",   label: "Unterputz Kabelverlegung",        einheit: "Meter",  einzelpreisEuro: 5,   kategorie: "kabel" },
  { key: "durchbruch",        label: "Durchbrüche",                     einheit: "Menge",  einzelpreisEuro: 20,  kategorie: "kabel" },

  // ─── Zähler ───────────────────────────────────────────────────────────────
  { key: "zaehler_ertuechtigung", label: "Zählerschrank Ertüchtigung",  einheit: "Menge",  einzelpreisEuro: 400, kategorie: "zaehler" },
  { key: "zwischenzaehler",       label: "Zwischenzähler",              einheit: "Menge",  einzelpreisEuro: 200, kategorie: "zaehler" },
  { key: "ehz_kasette",           label: "eHZ Kasette",                 einheit: "Menge",  einzelpreisEuro: 150, kategorie: "zaehler" },
  { key: "sls",                   label: "SLS",                         einheit: "Menge",  einzelpreisEuro: 150, kategorie: "zaehler" },
  { key: "zaehlerplatz_verdrahtung", label: "Zählerplatzverdrahtung",   einheit: "Menge",  einzelpreisEuro: 50,  kategorie: "zaehler" },
  { key: "zaehler_2zp",           label: "2 ZP Zählerschrank",          einheit: "Menge",  einzelpreisEuro: 300, kategorie: "zaehler" },
  { key: "zaehler_3zp",           label: "3 ZP Zählerschrank",          einheit: "Menge",  einzelpreisEuro: 450, kategorie: "zaehler" },
  { key: "zaehler_4zp",           label: "4 ZP Zählerschrank",          einheit: "Menge",  einzelpreisEuro: 600, kategorie: "zaehler" },
  { key: "zzl_2zu1",              label: "2:1 ZZL",                     einheit: "Menge",  einzelpreisEuro: 300, kategorie: "zaehler" },
  { key: "zzl_3zu1",              label: "3:1 ZZL",                     einheit: "Menge",  einzelpreisEuro: 450, kategorie: "zaehler" },
  { key: "zzl_4zu1",              label: "4:1 ZZL",                     einheit: "Menge",  einzelpreisEuro: 600, kategorie: "zaehler" },
  { key: "zzl_5zu1",              label: "5:1 ZZL",                     einheit: "Menge",  einzelpreisEuro: 750, kategorie: "zaehler" },
  { key: "epz_adapterplatten",    label: "EPZ Adapterplatten",          einheit: "Menge",  einzelpreisEuro: 150, kategorie: "zaehler" },
  { key: "zaehler_abmeldung",     label: "Zählerabmeldung Separat",     einheit: "Menge",  einzelpreisEuro: 150, kategorie: "zaehler" },

  // ─── Unterverteilungen ────────────────────────────────────────────────────
  { key: "uv_2reihig",        label: "UV Ersetzung Kleinverteiler 2-reihig", einheit: "Menge", einzelpreisEuro: 200, kategorie: "uv" },
  { key: "uv_3reihig",        label: "UV Ersetzung Kleinverteiler 3-reihig", einheit: "Menge", einzelpreisEuro: 260, kategorie: "uv" },
  { key: "uv_4reihig",        label: "UV Ersetzung Kleinverteiler 4-reihig", einheit: "Menge", einzelpreisEuro: 320, kategorie: "uv" },
  { key: "uv_anpassung",      label: "UV Anpassung",                    einheit: "Menge",  einzelpreisEuro: 135, kategorie: "uv" },
  { key: "uv_unterputz",      label: "UV Unterputz",                    einheit: "Menge",  einzelpreisEuro: 200, kategorie: "uv" },
  { key: "h_automatentausch", label: "H Automatentausch",               einheit: "Menge",  einzelpreisEuro: 10,  kategorie: "uv" },

  // ─── Sonstiges ────────────────────────────────────────────────────────────
  { key: "fi_schalter",       label: "FI Schalter",                     einheit: "Menge",  einzelpreisEuro: 60,  kategorie: "sonstiges" },
  { key: "sicherungstausch",  label: "Sicherungstausch",                einheit: "Menge",  einzelpreisEuro: 15,  kategorie: "sonstiges" },
  { key: "nh_trenner",        label: "NH Trenner",                      einheit: "Menge",  einzelpreisEuro: 450, kategorie: "sonstiges" },
  { key: "hak_zugang",        label: "HAK Zugang",                      einheit: "Menge",  einzelpreisEuro: 150, kategorie: "sonstiges" },
  { key: "rigips_entfernung", label: "Rigipswandentfernung",            einheit: "Menge",  einzelpreisEuro: 100, kategorie: "sonstiges" },
  { key: "okf",               label: "OKF",                             einheit: "Menge",  einzelpreisEuro: 200, kategorie: "sonstiges" },
  { key: "extra_stunde",      label: "Extra Stunde (nicht definierbare Leistung)", einheit: "Menge", einzelpreisEuro: 55, kategorie: "sonstiges" },
];

/**
 * Berechnet die Pauschalen-Abzüge basierend auf der UV-Anzahl.
 *
 * Regel:
 * - Zählerschrank mit max. 1 UV = 1 SLS, 10m 5x16mm, 10m 5x10mm, 10x H-Automaten, 1 Durchbruch
 * - Für jede weitere UV zusätzlich: 1 Durchbruch, 10m 5x10mm, 10x H-Automaten
 *
 * Rückgabe: Map von positionKey → Menge die durch Pauschale abgedeckt ist
 */
export function berechnePauschaleAbzug(uvAnzahl: number): Map<string, number> {
  const abzug = new Map<string, number>();

  if (uvAnzahl < 1) return abzug;

  // Basis (1 UV): 1 SLS, 10m 5x16mm, 10m 5x10mm, 10x H-Automaten, 1 Durchbruch
  abzug.set("sls",                1);
  abzug.set("kabel_5x16",         10);
  abzug.set("kabel_5x10",         10);
  abzug.set("h_automatentausch",  10);
  abzug.set("durchbruch",         1);

  // Für jede weitere UV: +1 Durchbruch, +10m 5x10mm, +10x H-Automaten
  const weitereUVs = Math.max(0, uvAnzahl - 1);
  if (weitereUVs > 0) {
    abzug.set("durchbruch",        (abzug.get("durchbruch") ?? 0) + weitereUVs);
    abzug.set("kabel_5x10",        (abzug.get("kabel_5x10") ?? 0) + weitereUVs * 10);
    abzug.set("h_automatentausch", (abzug.get("h_automatentausch") ?? 0) + weitereUVs * 10);
  }

  return abzug;
}

/**
 * Gibt alle Positionen zurück, die bei gegebener UV-Anzahl durch die Pauschale abgedeckt sind,
 * mit der jeweiligen Menge.
 */
export function getPauschalePositionen(uvAnzahl: number): { key: string; label: string; menge: number }[] {
  const abzug = berechnePauschaleAbzug(uvAnzahl);
  const result: { key: string; label: string; menge: number }[] = [];
  for (const [key, menge] of Array.from(abzug.entries())) {
    const pos = MK_KATALOG.find(p => p.key === key);
    if (pos) result.push({ key, label: pos.label, menge });
  }
  return result;
}
