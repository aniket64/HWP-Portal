import { describe, expect, it } from "vitest";
import { TABLES } from "./airtable";

const BASE_ID = "appjRcTYUcy6lmKx2";
const API_KEY = process.env.AIRTABLE_API_KEY;

describe("Airtable Service", () => {
  it("Tabellen-IDs sind korrekt definiert", () => {
    expect(TABLES.MEHRKOSTENFREIGABE).toBe("tbl7Ic2j1ozM0sTjF");
    expect(TABLES.SERVICE_RESSOURCEN).toBe("tblVuIY4TO1Odxew2");
    expect(TABLES.AKTUELLE_PAUSCHALEN).toBe("tblAWJS4XKLrv4Pd1");
    expect(TABLES.CRAFT_APPOINTMENTS).toBe("tblvBWCZgCWse4zjE");
    expect(Object.keys(TABLES)).toHaveLength(9);
  });

  it("AIRTABLE_API_KEY ist gesetzt", () => {
    expect(API_KEY).toBeTruthy();
    expect(API_KEY).toContain("pat");
  });

  it("Airtable-Verbindung liefert Datensätze", { timeout: 15000 }, async () => {
    if (!API_KEY) {
      console.warn("AIRTABLE_API_KEY nicht gesetzt – Test übersprungen");
      return;
    }
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.MEHRKOSTENFREIGABE}?maxRecords=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { records?: unknown[] };
    expect(Array.isArray(data.records)).toBe(true);
    expect((data.records ?? []).length).toBeGreaterThan(0);
  });
});
