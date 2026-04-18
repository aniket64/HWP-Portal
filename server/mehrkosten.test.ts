import { describe, it, expect } from "vitest";
import {
  berechnePauschaleAbzug,
  getPauschalePositionen,
  MK_KATALOG,
} from "../shared/mk-positionen-katalog";

describe("Mehrkosten Pauschalen-Abzug", () => {
  it("berechnePauschaleAbzug: 1 UV enthält korrekte Inklusivmengen", () => {
    const abzug = berechnePauschaleAbzug(1);
    expect(abzug.get("sls")).toBe(1);
    expect(abzug.get("kabel_5x16")).toBe(10);
    expect(abzug.get("kabel_5x10")).toBe(10);
    expect(abzug.get("h_automatentausch")).toBe(10);
    expect(abzug.get("durchbruch")).toBe(1);
  });

  it("berechnePauschaleAbzug: 2 UVs addiert korrekt weitere UV", () => {
    const abzug = berechnePauschaleAbzug(2);
    expect(abzug.get("sls")).toBe(1);
    expect(abzug.get("kabel_5x16")).toBe(10);
    expect(abzug.get("kabel_5x10")).toBe(20); // 10 + 10
    expect(abzug.get("h_automatentausch")).toBe(20); // 10 + 10
    expect(abzug.get("durchbruch")).toBe(2); // 1 + 1
  });

  it("berechnePauschaleAbzug: 4 UVs enthält korrekte Summen", () => {
    const abzug = berechnePauschaleAbzug(4);
    expect(abzug.get("sls")).toBe(1);
    expect(abzug.get("kabel_5x16")).toBe(10);
    expect(abzug.get("kabel_5x10")).toBe(40); // 10 + 3×10
    expect(abzug.get("h_automatentausch")).toBe(40); // 10 + 3×10
    expect(abzug.get("durchbruch")).toBe(4); // 1 + 3
  });

  it("berechnePauschaleAbzug: 0 UVs gibt leere Map zurück", () => {
    const abzug = berechnePauschaleAbzug(0);
    expect(abzug.size).toBe(0);
  });

  it("getPauschalePositionen: gibt Labels zurück", () => {
    const positionen = getPauschalePositionen(1);
    expect(positionen.length).toBeGreaterThan(0);
    const sls = positionen.find(p => p.key === "sls");
    expect(sls).toBeDefined();
    expect(sls?.menge).toBe(1);
    expect(sls?.label).toBe("SLS");
  });
});

describe("Mehrkosten Berechnung Frontend-Logik", () => {
  // Simuliert die Berechnung aus MkRechner.tsx
  function berechne(
    positionen: Record<string, number>,
    uvAnzahl: number,
    pauschaleBetrag: number
  ) {
    const pauschaleAbzug = berechnePauschaleAbzug(uvAnzahl);
    let bruttoSumme = 0;
    let pauschaleWert = 0;

    MK_KATALOG.forEach(pos => {
      const menge = positionen[pos.key] ?? 0;
      if (menge > 0) {
        bruttoSumme += menge * pos.einzelpreisEuro;
        const abzugMenge = pauschaleAbzug.get(pos.key) ?? 0;
        const tatsaechlicheAbzugMenge = Math.min(menge, abzugMenge);
        pauschaleWert += tatsaechlicheAbzugMenge * pos.einzelpreisEuro;
      }
    });

    return {
      bruttoSumme,
      pauschaleWert,
      summeOhnePauschale: bruttoSumme,
      summeMitPauschale: bruttoSumme - pauschaleWert + pauschaleBetrag,
    };
  }

  it("Nur Inklusivmaterial: summeOhnePauschale = Brutto, summeMitPauschale = pauschaleBetrag", () => {
    // 1 SLS (150 €) + 10m 5x16 (150 €) = 300 € brutto, alles in Pauschale
    const positionen = { sls: 1, kabel_5x16: 10 };
    const result = berechne(positionen, 1, 1200);

    expect(result.bruttoSumme).toBe(300); // 1×150 + 10×15
    expect(result.pauschaleWert).toBe(300); // alles inklusiv
    expect(result.summeOhnePauschale).toBe(300);
    expect(result.summeMitPauschale).toBe(1200); // 300 - 300 + 1200
  });

  it("Mehr Material als Inklusiv: Differenz wird berechnet", () => {
    // 2 SLS (300 €), aber nur 1 in Pauschale → 150 € netto-Mehrkosten
    const positionen = { sls: 2 };
    const result = berechne(positionen, 1, 1200);

    expect(result.bruttoSumme).toBe(300); // 2×150
    expect(result.pauschaleWert).toBe(150); // nur 1 inklusiv
    expect(result.summeOhnePauschale).toBe(300);
    expect(result.summeMitPauschale).toBe(1350); // 300 - 150 + 1200
  });

  it("Kein Inklusivmaterial: pauschaleWert = 0", () => {
    // Zählerschrank-Ertüchtigung ist nicht in Pauschale
    const positionen = { zaehler_ertuechtigung: 1 };
    const result = berechne(positionen, 1, 1200);

    expect(result.bruttoSumme).toBe(400);
    expect(result.pauschaleWert).toBe(0);
    expect(result.summeOhnePauschale).toBe(400);
    expect(result.summeMitPauschale).toBe(1600); // 400 - 0 + 1200
  });

  it("Kein pauschaleBetrag: summeMitPauschale = bruttoSumme - pauschaleWert", () => {
    const positionen = { sls: 1 };
    const result = berechne(positionen, 1, 0);

    expect(result.bruttoSumme).toBe(150);
    expect(result.pauschaleWert).toBe(150);
    expect(result.summeMitPauschale).toBe(0); // 150 - 150 + 0
  });

  it("Kabel 5x10: mehr als Inklusivmenge eingegeben", () => {
    // 1 UV: 10m 5x10 inklusiv. Eingabe: 25m → 15m netto
    const positionen = { kabel_5x10: 25 };
    const result = berechne(positionen, 1, 1000);

    expect(result.bruttoSumme).toBe(250); // 25×10
    expect(result.pauschaleWert).toBe(100); // 10×10
    expect(result.summeMitPauschale).toBe(1150); // 250 - 100 + 1000
  });
});

describe("MK_KATALOG Vollständigkeit", () => {
  it("Katalog enthält 34 Positionen", () => {
    expect(MK_KATALOG.length).toBe(34);
  });

  it("Alle Positionen haben eindeutige Keys", () => {
    const keys = MK_KATALOG.map(p => p.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("Alle Positionen haben positive Einzelpreise", () => {
    MK_KATALOG.forEach(pos => {
      expect(pos.einzelpreisEuro).toBeGreaterThan(0);
    });
  });
});
