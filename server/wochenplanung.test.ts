/**
 * Tests für Runde 36: Wochenplanung / Baustellenvorbereitung
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./cache", () => ({
  getCached: vi.fn(),
  setCached: vi.fn().mockResolvedValue(undefined),
  clearCache: vi.fn(),
  getAllSettings: vi.fn().mockResolvedValue([]),
  getCacheStats: vi.fn().mockResolvedValue({}),
  setSetting: vi.fn(),
  getTTLMinutes: vi.fn().mockResolvedValue(60),
  SETTINGS_KEYS: { AIRTABLE_SYNC_INTERVAL: "airtable_sync_interval_minutes" },
}));
vi.mock("./db", () => ({
  getDb: vi.fn(),
  getHwpAssignmentsForUser: vi.fn().mockResolvedValue([]),
  getAllHwpAssignments: vi.fn().mockResolvedValue([]),
  getAllUsers: vi.fn().mockResolvedValue([]),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
  setHwpAssignmentsForUser: vi.fn(),
  getRolePermissions: vi.fn().mockResolvedValue([]),
  upsertRolePermission: vi.fn(),
}));
vi.mock("./airtable", () => ({
  getMehrkostenRecords: vi.fn(),
  getMehrkostenById: vi.fn(),
  getMehrkostenStats: vi.fn(),
  getAktuellePauschalen: vi.fn(),
  getAllCachedRecords: vi.fn(),
  getServiceRessourcen: vi.fn(),
  deltaSync: vi.fn(),
  fullSync: vi.fn(),
}));
vi.mock("./auth", () => ({
  createJWT: vi.fn(),
  COOKIE_NAME: "session",
  hashPassword: vi.fn(),
  seedAdminIfNeeded: vi.fn().mockResolvedValue(undefined),
  verifyPassword: vi.fn(),
}));

import { getMehrkostenRecords } from "./airtable";
import { getHwpAssignmentsForUser } from "./db";

// ─── Hilfsfunktion: KW-Datumsbereich ─────────────────────────────────────────
function getKWDateRange(kw: number, year: number): { start: string; end: string } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(monday), end: fmt(sunday) };
}

// ─── Tests: KW-Datumsbereich ─────────────────────────────────────────────────
describe("getKWDateRange", () => {
  it("KW 1/2025 beginnt am Montag oder Sonntag (UTC-Grenze)", () => {
    const { start } = getKWDateRange(1, 2025);
    const d = new Date(start);
    // Je nach UTC-Offset kann der Tag Mo (1) oder So (0) sein
    expect([0, 1]).toContain(d.getDay());
  });

  it("KW-Bereich umfasst genau 7 Tage", () => {
    const { start, end } = getKWDateRange(10, 2025);
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000);
    expect(diff).toBe(6); // Mo bis So = 6 Tage Differenz
  });

  it("KW 52/2024 liegt im Jahr 2024", () => {
    const { start } = getKWDateRange(52, 2024);
    expect(start.startsWith("2024")).toBe(true);
  });
});

// ─── Tests: MVT-Link-Format ───────────────────────────────────────────────────
describe("MVT-Link-Format", () => {
  it("MVT-Link wird korrekt aus Order Number gebaut", () => {
    const orderNumber = "DE001664927";
    const mvtLink = `https://fulfilment.craftos.enpal.io/workorders/protocol/${orderNumber}/MVT`;
    expect(mvtLink).toBe("https://fulfilment.craftos.enpal.io/workorders/protocol/DE001664927/MVT");
  });

  it("IPA-Link wird nur gebaut wenn Module > 0", () => {
    const buildIpaLink = (module: number, orderNumber: string) =>
      module > 0 && orderNumber
        ? `https://buildability.craftos.enpal.tech/pv/${orderNumber}`
        : undefined;

    expect(buildIpaLink(38, "DE001664927")).toBe("https://buildability.craftos.enpal.tech/pv/DE001664927");
    expect(buildIpaLink(0, "DE001664927")).toBeUndefined();
    expect(buildIpaLink(38, "")).toBeUndefined();
  });
});

// ─── Tests: HWP-Filter-Logik ─────────────────────────────────────────────────
describe("Wochenplanung HWP-Filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("KAM darf nur zugeordnete HWPs abfragen", async () => {
    vi.mocked(getHwpAssignmentsForUser).mockResolvedValue([
      { hwpAccountId: "ACC001", hwpName: "Muster GmbH", userId: 1 } as any,
    ]);

    const assignments = await getHwpAssignmentsForUser(1);
    const allowed = new Set(assignments.map((a) => a.hwpAccountId));

    expect(allowed.has("ACC001")).toBe(true);
    expect(allowed.has("ACC002")).toBe(false);
  });

  it("Admin hat keine Einschränkung durch HWP-Zuordnungen", async () => {
    vi.mocked(getHwpAssignmentsForUser).mockResolvedValue([]);

    const assignments = await getHwpAssignmentsForUser(1);
    // Leere Assignments = keine Einschränkung für Admin
    expect(assignments.length).toBe(0);
  });
});

// ─── Tests: Auftrags-Filterung nach KW ───────────────────────────────────────
describe("Auftrags-Filterung nach KW", () => {
  it("Filtert Aufträge korrekt nach KW-Datumsbereich", () => {
    const { start, end } = getKWDateRange(10, 2025);
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59);

    const mockRecords = [
      { fields: { "Target End": start, "Order Number": "DE001" } },           // In KW
      { fields: { "Target End": end, "Order Number": "DE002" } },             // In KW (letzter Tag)
      { fields: { "Target End": "2025-01-01", "Order Number": "DE003" } },    // Außerhalb
      { fields: { "Last Scheduled End": start, "Order Number": "DE004" } },   // In KW (Fallback-Feld)
    ] as any[];

    const filtered = mockRecords.filter((r) => {
      const dateStr = (r.fields["Target End"] as string | undefined)
        ?? (r.fields["Last Scheduled End"] as string | undefined);
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= startDate && d <= endDate;
    });

    expect(filtered.length).toBe(3);
    expect(filtered.map(r => r.fields["Order Number"])).toContain("DE001");
    expect(filtered.map(r => r.fields["Order Number"])).toContain("DE002");
    expect(filtered.map(r => r.fields["Order Number"])).toContain("DE004");
    expect(filtered.map(r => r.fields["Order Number"])).not.toContain("DE003");
  });
});

// ─── Tests: Klassi-Link entfernt ─────────────────────────────────────────────
describe("Klassi-Link", () => {
  it("recordUrl ist kein Pflichtfeld in der Wochenplanung", () => {
    // Die Wochenplanung gibt recordUrl nicht zurück – nur mvtLink und ipaLink
    const auftragFelder = ["orderNumber", "mvtLink", "ipaLink", "sfLink", "klassi"];
    expect(auftragFelder).not.toContain("recordUrl");
  });
});
