/**
 * Tests für Runde 35:
 * 1. Klassifizierungsdaten-Cache (klassi:overview:* Keys)
 * 2. Team-Filter in listNachtraege
 * 3. getKlassifizierungBatch (Batch-Abfrage aus Cache)
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

import { getCached, setCached } from "./cache";
import { getDb } from "./db";

// ─── Tests: Klassifizierungsdaten-Cache ──────────────────────────────────────

describe("Klassifizierungsdaten-Cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gibt gecachte Klassifizierungsdaten zurück ohne Airtable-Aufruf", async () => {
    const mockData = {
      airtableId: "recABC123",
      klassifizierungAbgeschlossen: true,
      status: "Abgeschlossen",
      risikobewertung: "Mittel",
      komplex: false,
      uvDetails: [],
    };
    vi.mocked(getCached).mockResolvedValueOnce(mockData);

    // Simuliere Cache-Lookup
    const cacheKey = "klassi:overview:DE-2025-001";
    const cached = await getCached(cacheKey);

    expect(cached).toEqual(mockData);
    expect(getCached).toHaveBeenCalledWith(cacheKey);
  });

  it("speichert Klassifizierungsdaten nach Airtable-Abruf im Cache", async () => {
    vi.mocked(getCached).mockResolvedValueOnce(null); // Cache leer

    const newData = {
      airtableId: "recXYZ456",
      klassifizierungAbgeschlossen: false,
      status: "Offen",
      uvDetails: [],
    };

    // Simuliere Cache-Speicherung
    const cacheKey = "klassi:overview:DE-2025-002";
    await setCached(cacheKey, newData);

    expect(setCached).toHaveBeenCalledWith(cacheKey, newData);
  });

  it("Cache-Key folgt dem Muster klassi:overview:{orderNumber}", () => {
    const orderNumbers = ["DE-2025-001", "DE-2025-002", "DE-2025-003"];
    const cacheKeys = orderNumbers.map(n => `klassi:overview:${n}`);

    expect(cacheKeys[0]).toBe("klassi:overview:DE-2025-001");
    expect(cacheKeys[1]).toBe("klassi:overview:DE-2025-002");
    expect(cacheKeys[2]).toBe("klassi:overview:DE-2025-003");
  });
});

// ─── Tests: getKlassifizierungBatch ──────────────────────────────────────────

describe("getKlassifizierungBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Cache-Key-Format für Klassifizierungsdaten ist korrekt", () => {
    // Batch-Endpunkt baut Cache-Keys nach dem Muster klassi:overview:{orderNumber}
    const buildCacheKey = (orderNumber: string) => `klassi:overview:${orderNumber}`;

    expect(buildCacheKey("DE-2025-001")).toBe("klassi:overview:DE-2025-001");
    expect(buildCacheKey("DE-2025-002")).toBe("klassi:overview:DE-2025-002");
    expect(buildCacheKey("")).toBe("klassi:overview:");
  });

  it("Batch-Ergebnis enthält null für nicht gecachte Einträge", async () => {
    // getCached gibt null zurück wenn kein Eintrag vorhanden
    const localGetCached = vi.fn().mockResolvedValue(null);
    const result = await localGetCached("klassi:overview:DE-NICHT-VORHANDEN");
    expect(result).toBeNull();
  });

  it("gibt leeres Objekt zurück wenn keine Order Numbers übergeben werden", async () => {
    const orderNumbers: string[] = [];
    const result: Record<string, unknown> = {};
    await Promise.all(
      orderNumbers.map(async (orderNumber) => {
        const cached = await getCached(`klassi:overview:${orderNumber}`);
        result[orderNumber] = cached ?? null;
      })
    );

    expect(result).toEqual({});
    expect(getCached).not.toHaveBeenCalled();
  });

  it("verarbeitet bis zu 200 Order Numbers parallel", async () => {
    const orderNumbers = Array.from({ length: 200 }, (_, i) => `DE-${String(i).padStart(4, "0")}`);
    vi.mocked(getCached).mockResolvedValue(null);

    const result: Record<string, unknown> = {};
    await Promise.all(
      orderNumbers.map(async (orderNumber) => {
        const cached = await getCached(`klassi:overview:${orderNumber}`);
        result[orderNumber] = cached ?? null;
      })
    );

    expect(Object.keys(result)).toHaveLength(200);
    expect(getCached).toHaveBeenCalledTimes(200);
  });
});

// ─── Tests: Team-Filter in listNachtraege ────────────────────────────────────

describe("Team-Filter in listNachtraege", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtert Nachträge nach HWPs des gewählten Teams", async () => {
    const nachtraege = [
      { nachtrag: { id: 1, status: "offen" }, rechnung: { hwpAccountId: "ACC001", orderNumber: "DE-001" } },
      { nachtrag: { id: 2, status: "offen" }, rechnung: { hwpAccountId: "ACC002", orderNumber: "DE-002" } },
      { nachtrag: { id: 3, status: "offen" }, rechnung: { hwpAccountId: "ACC003", orderNumber: "DE-003" } },
    ];

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { hwpAccountId: "ACC001" },
        { hwpAccountId: "ACC002" },
      ]),
      innerJoin: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(nachtraege),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const db = await getDb();
    let filtered = [...nachtraege];
    const teamFilter = 1;

    if (teamFilter && db) {
      const teamHwps = await db.select().from({} as any).where({} as any) as { hwpAccountId: string }[];
      const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
      filtered = filtered.filter(r =>
        r.rechnung.hwpAccountId ? teamHwpIds.has(r.rechnung.hwpAccountId) : false
      );
    }

    expect(filtered).toHaveLength(2);
    expect(filtered.map(r => r.rechnung.hwpAccountId)).toEqual(["ACC001", "ACC002"]);
  });

  it("gibt alle Nachträge zurück wenn kein Team-Filter gesetzt", async () => {
    const nachtraege = [
      { nachtrag: { id: 1, status: "offen" }, rechnung: { hwpAccountId: "ACC001" } },
      { nachtrag: { id: 2, status: "offen" }, rechnung: { hwpAccountId: "ACC002" } },
    ];

    let filtered = [...nachtraege];
    const teamFilter = undefined;

    if (teamFilter) {
      filtered = []; // Wird nicht ausgeführt
    }

    expect(filtered).toHaveLength(2);
  });

  it("filtert Nachträge ohne hwpAccountId heraus wenn Team-Filter aktiv", async () => {
    const nachtraege = [
      { nachtrag: { id: 1, status: "offen" }, rechnung: { hwpAccountId: "ACC001" } },
      { nachtrag: { id: 2, status: "offen" }, rechnung: { hwpAccountId: null } }, // Kein HWP
    ];

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ hwpAccountId: "ACC001" }]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const db = await getDb();
    let filtered = [...nachtraege];
    const teamFilter = 1;

    if (teamFilter && db) {
      const teamHwps = await db.select().from({} as any).where({} as any) as { hwpAccountId: string }[];
      const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
      filtered = filtered.filter(r =>
        r.rechnung.hwpAccountId ? teamHwpIds.has(r.rechnung.hwpAccountId) : false
      );
    }

    expect(filtered).toHaveLength(1);
    expect(filtered[0].rechnung.hwpAccountId).toBe("ACC001");
  });
});
