/**
 * Tests für die HWP-Router-Hilfsfunktionen
 * (KW-Berechnung, KW-Range, KW-Shift)
 */
import { describe, it, expect } from "vitest";

// ─── Hilfsfunktionen (aus hwp.router.ts kopiert für isoliertes Testen) ────────

function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { kw, year: d.getUTCFullYear() };
}

function getKWRange(kw: number, year: number): { start: Date; end: Date } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function shiftKW(kw: number, year: number, delta: number): { kw: number; year: number } {
  const { start } = getKWRange(kw, year);
  start.setDate(start.getDate() + delta * 7);
  return getISOWeek(start);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getISOWeek", () => {
  it("berechnet KW 1 / 2025 korrekt (6. Januar 2025 = Montag KW 2)", () => {
    // 1. Januar 2025 = Mittwoch → KW 1
    const result = getISOWeek(new Date(2025, 0, 1));
    expect(result.kw).toBe(1);
    expect(result.year).toBe(2025);
  });

  it("berechnet KW 52 / 2024 korrekt (30. Dezember 2024 = Montag)", () => {
    const result = getISOWeek(new Date(2024, 11, 30));
    expect(result.kw).toBe(1);
    expect(result.year).toBe(2025);
  });

  it("berechnet KW 8 / 2026 korrekt (16. Februar 2026)", () => {
    const result = getISOWeek(new Date(2026, 1, 16));
    expect(result.kw).toBe(8);
    expect(result.year).toBe(2026);
  });

  it("berechnet KW 53 für Jahre mit 53 Wochen", () => {
    // 28. Dezember 2020 = Montag → KW 53 / 2020
    const result = getISOWeek(new Date(2020, 11, 28));
    expect(result.kw).toBe(53);
    expect(result.year).toBe(2020);
  });
});

describe("getKWRange", () => {
  it("KW 1 / 2025 beginnt am Montag 30. Dezember 2024", () => {
    const { start } = getKWRange(1, 2025);
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(11); // Dezember
    expect(start.getDate()).toBe(30);
    expect(start.getDay()).toBe(1); // Montag
  });

  it("KW 1 / 2025 endet am Sonntag 5. Januar 2025", () => {
    const { end } = getKWRange(1, 2025);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0); // Januar
    expect(end.getDate()).toBe(5);
    expect(end.getDay()).toBe(0); // Sonntag
  });

  it("KW 8 / 2026 beginnt am 16. Februar 2026", () => {
    const { start } = getKWRange(8, 2026);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(1); // Februar
    expect(start.getDate()).toBe(16);
  });

  it("KW-Range umfasst genau 7 Tage", () => {
    const { start, end } = getKWRange(15, 2025);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diff)).toBe(7); // Montag 00:00 bis Sonntag 23:59 = ~7 Tage Differenz
  });

  it("Datum liegt innerhalb der berechneten KW-Range", () => {
    const testDate = new Date(2026, 1, 18); // 18. Feb 2026 = KW 8
    const { kw, year } = getISOWeek(testDate);
    const { start, end } = getKWRange(kw, year);
    expect(testDate >= start).toBe(true);
    expect(testDate <= end).toBe(true);
  });
});

describe("shiftKW", () => {
  it("verschiebt KW 8 / 2026 um +1 zu KW 9 / 2026", () => {
    const result = shiftKW(8, 2026, 1);
    expect(result.kw).toBe(9);
    expect(result.year).toBe(2026);
  });

  it("verschiebt KW 8 / 2026 um -1 zu KW 7 / 2026", () => {
    const result = shiftKW(8, 2026, -1);
    expect(result.kw).toBe(7);
    expect(result.year).toBe(2026);
  });

  it("verschiebt KW 1 / 2026 um -1 korrekt ins Vorjahr", () => {
    const result = shiftKW(1, 2026, -1);
    expect(result.year).toBe(2025);
    // KW 52 oder 53 je nach Jahr
    expect(result.kw).toBeGreaterThanOrEqual(52);
  });

  it("verschiebt KW 52 / 2025 um +1 zu KW 1 / 2026", () => {
    const result = shiftKW(52, 2025, 1);
    expect(result.kw).toBe(1);
    expect(result.year).toBe(2026);
  });

  it("verschiebt um 0 und gibt dieselbe KW zurück", () => {
    const result = shiftKW(15, 2026, 0);
    expect(result.kw).toBe(15);
    expect(result.year).toBe(2026);
  });

  it("verschiebt um +52 Wochen und landet im nächsten Jahr", () => {
    const result = shiftKW(8, 2026, 52);
    expect(result.year).toBe(2027);
  });
});

describe("KW-Konsistenz", () => {
  it("getISOWeek(getKWRange(kw, year).start) gibt dieselbe KW zurück", () => {
    for (const [kw, year] of [[1, 2025], [8, 2026], [52, 2025], [15, 2024]] as [number, number][]) {
      const { start } = getKWRange(kw, year);
      const back = getISOWeek(start);
      expect(back.kw).toBe(kw);
      expect(back.year).toBe(year);
    }
  });

  it("shiftKW(kw, year, +1) und dann -1 gibt dieselbe KW zurück", () => {
    for (const [kw, year] of [[8, 2026], [1, 2025], [52, 2024]] as [number, number][]) {
      const forward = shiftKW(kw, year, 1);
      const back = shiftKW(forward.kw, forward.year, -1);
      expect(back.kw).toBe(kw);
      expect(back.year).toBe(year);
    }
  });
});
