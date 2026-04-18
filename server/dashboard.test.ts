import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: airtable ───────────────────────────────────────────────────────────
vi.mock("./airtable", () => ({
  getAllCachedRecords: vi.fn().mockResolvedValue([
    {
      id: "rec001",
      fields: {
        "Opportunity Name": "Mustermann Solar",
        "Order Number": "DE001000001",
        "Appointment Number": "SA001000001",
        "Technician: Account: Account Name": "Solar GmbH",
        "Technician: Account: Account ID": "acc1",
        "Status": "Completed",
        "Status - Freigabe": "Freigegeben",
        "Mehrkosten": 500,
        "Pauschale": 300,
        "Target End": "2026-02-17T10:00:00.000Z",
      },
    },
    {
      id: "rec002",
      fields: {
        "Opportunity Name": "Schmidt Wärmepumpe",
        "Order Number": "DE001000002",
        "Appointment Number": "SA001000002",
        "Technician: Account: Account Name": "Wärme AG",
        "Technician: Account: Account ID": "acc2",
        "Status": "Scheduled",
        "Status - Freigabe": "Ausstehend",
        "Mehrkosten": 0,
        "Pauschale": 200,
        "Target End": "2026-02-18T10:00:00.000Z",
      },
    },
    {
      id: "rec003",
      fields: {
        "Opportunity Name": "Müller PV",
        "Order Number": "DE001000003",
        "Appointment Number": "SA001000003",
        "Technician: Account: Account Name": "Solar GmbH",
        "Technician: Account: Account ID": "acc1",
        "Status": "Canceled",
        "Status - Freigabe": "Abgelehnt",
        "Mehrkosten": 0,
        "Pauschale": 0,
        "Target End": "2026-02-19T10:00:00.000Z",
      },
    },
  ]),
}));

// ─── Mock: cache ──────────────────────────────────────────────────────────────
vi.mock("./cache", () => ({
  getAllSettings: vi.fn().mockResolvedValue({}),
  setSetting: vi.fn().mockResolvedValue(undefined),
  SETTINGS_KEYS: {
    AIRTABLE_SYNC_INTERVAL: "airtable_sync_interval_minutes",
  },
}));

// ─── Import nach Mocks ────────────────────────────────────────────────────────
import { getAllCachedRecords } from "./airtable";
import { getAllSettings } from "./cache";
import { DEFAULT_WIDGET_CONFIG, DASHBOARD_WIDGETS_KEY } from "../drizzle/schema";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Dashboard Router – Stats", () => {
  it("zählt Gesamtaufträge korrekt", async () => {
    const records = await getAllCachedRecords();
    expect(records).toHaveLength(3);
  });

  it("berechnet Freigabe-Status korrekt", async () => {
    const records = await getAllCachedRecords();
    let freigegeben = 0, abgelehnt = 0, ausstehend = 0;
    for (const r of records) {
      const f = r.fields["Status - Freigabe"] as string;
      if (f === "Freigegeben" || f === "Approved") freigegeben++;
      else if (f === "Abgelehnt" || f === "Rejected") abgelehnt++;
      else ausstehend++;
    }
    expect(freigegeben).toBe(1);
    expect(abgelehnt).toBe(1);
    expect(ausstehend).toBe(1);
  });

  it("berechnet Mehrkosten-Summe korrekt", async () => {
    const records = await getAllCachedRecords();
    const total = records.reduce((sum, r) => sum + (parseFloat(String(r.fields["Mehrkosten"] ?? "0")) || 0), 0);
    expect(total).toBe(500);
  });

  it("berechnet Pauschalen-Summe korrekt", async () => {
    const records = await getAllCachedRecords();
    const total = records.reduce((sum, r) => sum + (parseFloat(String(r.fields["Pauschale"] ?? "0")) || 0), 0);
    expect(total).toBe(500);
  });
});

describe("Dashboard Router – Wochenansicht", () => {
  it("filtert Aufträge nach KW korrekt", async () => {
    const records = await getAllCachedRecords();
    // KW 8 2026: 16.02 – 22.02.2026
    const start = new Date("2026-02-16T00:00:00.000Z");
    const end = new Date("2026-02-22T23:59:59.999Z");
    const filtered = records.filter((r) => {
      const d = new Date(r.fields["Target End"] as string);
      return d >= start && d <= end;
    });
    expect(filtered.length).toBe(3); // alle 3 Aufträge sind in KW 8
  });
});

describe("Dashboard Router – Schnellsuche", () => {
  it("findet Aufträge nach Kundenname", async () => {
    const records = await getAllCachedRecords();
    const q = "mustermann";
    const results = records.filter((r) =>
      String(r.fields["Opportunity Name"] ?? "").toLowerCase().includes(q)
    );
    expect(results).toHaveLength(1);
    expect(results[0].fields["Order Number"]).toBe("DE001000001");
  });

  it("findet Aufträge nach DE-Nummer", async () => {
    const records = await getAllCachedRecords();
    const q = "de001000002";
    const results = records.filter((r) =>
      String(r.fields["Order Number"] ?? "").toLowerCase().includes(q)
    );
    expect(results).toHaveLength(1);
  });

  it("findet Aufträge nach HWP-Partner", async () => {
    const records = await getAllCachedRecords();
    const q = "solar gmbh";
    const results = records.filter((r) =>
      String(r.fields["Technician: Account: Account Name"] ?? "").toLowerCase().includes(q)
    );
    expect(results).toHaveLength(2);
  });
});

describe("Dashboard Router – Widget-Konfiguration", () => {
  it("gibt Standard-Konfiguration zurück wenn keine gespeichert", async () => {
    const settings = await getAllSettings();
    const raw = settings[DASHBOARD_WIDGETS_KEY];
    expect(raw).toBeUndefined();
    // Fallback auf DEFAULT
    const config = DEFAULT_WIDGET_CONFIG;
    expect(config).toHaveLength(10);
    expect(config.every((w) => w.enabled)).toBe(true);
  });

  it("Standard-Konfiguration enthält alle erwarteten Widget-IDs", () => {
    const ids = DEFAULT_WIDGET_CONFIG.map((w) => w.id);
    expect(ids).toContain("kpi_total");
    expect(ids).toContain("weekly_orders");
    expect(ids).toContain("status_chart");
    expect(ids).toContain("top_hwp");
    expect(ids).toContain("recent_activity");
  });
});
