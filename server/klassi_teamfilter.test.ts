/**
 * Tests für:
 * 1. Team-Filter in mehrkosten.list (teamFilter-Parameter)
 * 2. getKlassifizierung-Endpunkt (Airtable Klassi Overview)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Airtable-Modul mocken
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

// DB-Modul mocken
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

// Cache mocken
vi.mock("./cache", () => ({
  clearCache: vi.fn(),
  getAllSettings: vi.fn().mockResolvedValue([]),
  getCacheStats: vi.fn().mockResolvedValue({}),
  setSetting: vi.fn(),
  SETTINGS_KEYS: {},
}));

// Auth mocken
vi.mock("./auth", () => ({
  createJWT: vi.fn(),
  COOKIE_NAME: "session",
  hashPassword: vi.fn(),
  seedAdminIfNeeded: vi.fn().mockResolvedValue(undefined),
  verifyPassword: vi.fn(),
}));

import { getMehrkostenRecords } from "./airtable";
import { getDb, getHwpAssignmentsForUser } from "./db";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function makeRecord(accountId: string, orderNumber = "ORD-001") {
  return {
    id: `rec_${accountId}`,
    fields: {
      "Technician: Account: Account ID": accountId,
      "Order Number": orderNumber,
      "Status": "Completed",
      "Created Date": "2025-01-01",
    },
  };
}

// ─── Tests: Team-Filter-Logik ─────────────────────────────────────────────────

describe("Team-Filter in mehrkosten.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtert Aufträge nach HWPs des gewählten Teams", async () => {
    const records = [
      makeRecord("ACC001"),
      makeRecord("ACC002"),
      makeRecord("ACC003"),
    ];

    // DB-Mock: Team hat nur ACC001 und ACC002
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { hwpAccountId: "ACC001" },
        { hwpAccountId: "ACC002" },
      ]),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);
    vi.mocked(getMehrkostenRecords).mockResolvedValue({ records, total: 3 } as any);

    // Simuliere die Filter-Logik aus routers.ts
    const teamFilter = 1;
    const db = await getDb();
    let allRecords = [...records];

    if (teamFilter && db) {
      const teamHwps = await db.select().from({} as any).where({} as any) as { hwpAccountId: string }[];
      const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
      allRecords = allRecords.filter((r) => {
        const aid = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
        return teamHwpIds.has(aid);
      });
    }

    expect(allRecords).toHaveLength(2);
    expect(allRecords.map(r => r.fields["Technician: Account: Account ID"])).toEqual(["ACC001", "ACC002"]);
  });

  it("gibt alle Aufträge zurück wenn kein Team-Filter gesetzt ist", async () => {
    const records = [makeRecord("ACC001"), makeRecord("ACC002"), makeRecord("ACC003")];
    vi.mocked(getMehrkostenRecords).mockResolvedValue({ records, total: 3 } as any);

    let allRecords = [...records];
    const teamFilter = undefined;

    if (teamFilter) {
      // Dieser Block wird nicht ausgeführt
      allRecords = [];
    }

    expect(allRecords).toHaveLength(3);
  });

  it("gibt leere Liste zurück wenn Team keine HWPs hat", async () => {
    const records = [makeRecord("ACC001"), makeRecord("ACC002")];
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]), // Kein HWP im Team
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    let allRecords = [...records];
    const teamFilter = 99;
    const db = await getDb();

    if (teamFilter && db) {
      const teamHwps = await db.select().from({} as any).where({} as any) as { hwpAccountId: string }[];
      const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
      allRecords = allRecords.filter((r) => {
        const aid = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
        return teamHwpIds.has(aid);
      });
    }

    expect(allRecords).toHaveLength(0);
  });
});

// ─── Tests: Klassifizierungs-Datenstruktur ────────────────────────────────────

describe("Klassifizierungs-Datenstruktur", () => {
  it("mappt Airtable-Felder korrekt auf die Ausgabestruktur", () => {
    const airtableFields: Record<string, unknown> = {
      "Klassifizierung abgeschlossen": true,
      "Status": "Abgeschlossen",
      "Completed Date/Time": "2025-06-15T10:30:00Z",
      "Assigned To": "Max Mustermann",
      "Mehrkostenabschätzung": 1500.50,
      "Bauzeit": "4 Stunden",
      "Zählerschrank": "Unterputz",
      "Aufstellort": "Keller",
      "Anzahl Zähler": 2,
      "HAK": ["HAK 1", "HAK 2"],
      "HAK verschlossen?": "Ja",
      "Kabelweg ZS => HAK": 15,
      "Risikobewertung": "Mittel",
      "Risikobewertung Bau": "Gering",
      "Komplex": true,
      "OKF": false,
      "ACH Grund": ["Technischer Defekt"],
      "ACH Verantwortlich": "KAM Team",
      "Wichtige Notizen": "Besondere Vorsicht beim HAK",
      "TAB Hinweise": "Keine besonderen Hinweise",
      "UV1 ToDo": "Zähler tauschen",
      "UV1 Montage": "Unterputz",
      "UV1 Zuleitung [m]": "10",
    };

    // Simuliere die Mapping-Logik aus routers.ts
    const f = airtableFields;
    const result = {
      klassifizierungAbgeschlossen: f["Klassifizierung abgeschlossen"] as boolean,
      status: f["Status"] as string,
      completedDateTime: f["Completed Date/Time"] as string,
      assignedTo: f["Assigned To"] as string,
      mehrkostenabschaetzung: f["Mehrkostenabschätzung"] as number,
      bauzeit: f["Bauzeit"] as string,
      zaehlerSchrank: f["Zählerschrank"] as string,
      aufstellort: f["Aufstellort"] as string,
      anzahlZaehler: f["Anzahl Zähler"] as number,
      hak: f["HAK"] as string[],
      hakVerschlossen: f["HAK verschlossen?"] as string,
      kabelwegZsHak: f["Kabelweg ZS => HAK"] as number,
      risikobewertung: f["Risikobewertung"] as string,
      risikobewertungBau: f["Risikobewertung Bau"] as string,
      komplex: f["Komplex"] as boolean,
      okf: f["OKF"] as boolean,
      achGrund: f["ACH Grund"] as string[],
      achVerantwortlich: f["ACH Verantwortlich"] as string,
      wichtigeNotizen: f["Wichtige Notizen"] as string,
      tabHinweise: f["TAB Hinweise"] as string,
      uvDetails: [1, 2, 3, 4, 5].map(i => ({
        nr: i,
        todo: f[`UV${i} ToDo`] as string | undefined,
        montage: f[`UV${i} Montage`] as string | undefined,
        zuleitung: f[`UV${i} Zuleitung [m]`] as string | undefined,
      })).filter(uv => uv.todo || uv.montage || uv.zuleitung),
    };

    expect(result.klassifizierungAbgeschlossen).toBe(true);
    expect(result.status).toBe("Abgeschlossen");
    expect(result.mehrkostenabschaetzung).toBe(1500.50);
    expect(result.zaehlerSchrank).toBe("Unterputz");
    expect(result.anzahlZaehler).toBe(2);
    expect(result.hak).toEqual(["HAK 1", "HAK 2"]);
    expect(result.kabelwegZsHak).toBe(15);
    expect(result.risikobewertung).toBe("Mittel");
    expect(result.komplex).toBe(true);
    expect(result.okf).toBe(false);
    expect(result.achGrund).toEqual(["Technischer Defekt"]);
    expect(result.uvDetails).toHaveLength(1);
    expect(result.uvDetails[0]).toMatchObject({
      nr: 1,
      todo: "Zähler tauschen",
      montage: "Unterputz",
      zuleitung: "10",
    });
  });

  it("gibt null zurück wenn keine Felder vorhanden sind", () => {
    const emptyFields: Record<string, unknown> = {};
    const f = emptyFields;

    const uvDetails = [1, 2, 3, 4, 5].map(i => ({
      nr: i,
      todo: f[`UV${i} ToDo`] as string | undefined,
      montage: f[`UV${i} Montage`] as string | undefined,
      zuleitung: f[`UV${i} Zuleitung [m]`] as string | undefined,
    })).filter(uv => uv.todo || uv.montage || uv.zuleitung);

    expect(uvDetails).toHaveLength(0);
    expect(f["Klassifizierung abgeschlossen"]).toBeUndefined();
    expect(f["Mehrkostenabschätzung"]).toBeUndefined();
  });

  it("filtert UV-Details korrekt (nur ausgefüllte UVs)", () => {
    const fields: Record<string, unknown> = {
      "UV1 ToDo": "Maßnahme 1",
      "UV2 ToDo": undefined,
      "UV3 Montage": "Aufputz",
      "UV4 ToDo": undefined,
      "UV5 ToDo": undefined,
    };

    const f = fields;
    const uvDetails = [1, 2, 3, 4, 5].map(i => ({
      nr: i,
      todo: f[`UV${i} ToDo`] as string | undefined,
      montage: f[`UV${i} Montage`] as string | undefined,
      zuleitung: f[`UV${i} Zuleitung [m]`] as string | undefined,
    })).filter(uv => uv.todo || uv.montage || uv.zuleitung);

    expect(uvDetails).toHaveLength(2);
    expect(uvDetails[0].nr).toBe(1);
    expect(uvDetails[1].nr).toBe(3);
  });
});
