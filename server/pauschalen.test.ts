import { describe, it, expect } from "vitest";
import { TABLES } from "./airtable";

describe("Konditionen Backend", () => {
  it("AKTUELLE_PAUSCHALEN Tabellen-ID ist korrekt definiert", () => {
    expect(TABLES.AKTUELLE_PAUSCHALEN).toBe("tblAWJS4XKLrv4Pd1");
  });

  it("Airtable AKTUELLE_PAUSCHALEN liefert Datensätze mit UV-Feldern", async () => {
    const { getAktuellePauschalen } = await import("./airtable");
    const result = await getAktuellePauschalen(true); // bypassCache
    expect(result.records.length).toBeGreaterThan(0);
    const first = result.records[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("fields");
    const hasUvField =
      "1_uv" in first.fields ||
      "2_uv" in first.fields ||
      "3_uv" in first.fields ||
      "4_uv" in first.fields;
    expect(hasUvField).toBe(true);
  }, 20000);

  it("Sortierung nach 1_uv (desc) funktioniert korrekt", () => {
    const records = [
      { id: "1", fields: { HWP_Select: "Alpha", "1_uv": 1500 }, createdTime: "" },
      { id: "2", fields: { HWP_Select: "Beta", "1_uv": 1800 }, createdTime: "" },
      { id: "3", fields: { HWP_Select: "Gamma", "1_uv": 1200 }, createdTime: "" },
    ];
    const sorted = [...records].sort((a, b) => (b.fields["1_uv"] as number) - (a.fields["1_uv"] as number));
    expect(sorted[0].fields["1_uv"]).toBe(1800);
    expect(sorted[1].fields["1_uv"]).toBe(1500);
    expect(sorted[2].fields["1_uv"]).toBe(1200);
  });

  it("Suche nach HWP-Name filtert korrekt", () => {
    const records = [
      { id: "1", fields: { HWP_Select: "Mustermann GmbH" }, createdTime: "" },
      { id: "2", fields: { HWP_Select: "Elektro Schulz" }, createdTime: "" },
      { id: "3", fields: { HWP_Select: "Muster AG" }, createdTime: "" },
    ];
    const search = "muster";
    const filtered = records.filter((r) =>
      String(r.fields.HWP_Select ?? "").toLowerCase().includes(search)
    );
    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe("1");
    expect(filtered[1].id).toBe("3");
  });

  it("Währungsformatierung gibt korrekte Strings zurück", () => {
    const format = (value: number) =>
      new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

    expect(format(1500)).toContain("1.500");
    expect(format(0)).toContain("0");
    expect(format(1800)).toContain("1.800");
  });
});
