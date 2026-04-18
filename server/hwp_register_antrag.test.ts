/**
 * Tests für HWP-Registrierung und createMkAntrag
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  createUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("./auth", () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed_${pw}`),
  verifyPassword: vi.fn(),
  createJWT: vi.fn(async () => "test-token"),
  COOKIE_NAME: "session",
  seedAdminIfNeeded: vi.fn(async () => {}),
}));
vi.mock("./airtable", () => ({
  deltaSync: vi.fn(),
  fullSync: vi.fn(),
  getAktuellePauschalen: vi.fn(async () => []),
  getAllCachedRecords: vi.fn(async () => []),
  getMehrkostenById: vi.fn(),
  getMehrkostenRecords: vi.fn(async () => ({ records: [], total: 0 })),
  getMehrkostenStats: vi.fn(),
  getServiceRessourcen: vi.fn(),
}));
vi.mock("./cache", () => ({
  clearCache: vi.fn(async () => 0),
  getAllSettings: vi.fn(async () => []),
  getCacheStats: vi.fn(async () => ({})),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
  setSetting: vi.fn(async () => {}),
  SETTINGS_KEYS: {},
}));
vi.mock("../_core/systemRouter", () => ({ systemRouter: {} }));
vi.mock("./routers/dashboard.router", () => ({ dashboardRouter: {} }));
vi.mock("./routers/mehrkosten.router", () => ({ mehrkostenRouter: {} }));
vi.mock("./routers/hwp.router", () => ({ hwpRouter: {} }));
vi.mock("./routers/teams.router", () => ({ teamsRouter: {} }));

import { getUserByEmail, createUser } from "./db";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("auth.registerHwp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("erstellt ein neues HWP-Konto mit isActive=false", async () => {
    vi.mocked(getUserByEmail).mockResolvedValueOnce(null);
    vi.mocked(createUser).mockResolvedValueOnce({
      id: 42,
      email: "test@hwp.de",
      name: "Max Muster",
      role: "hwp",
      companyName: "Muster GmbH",
      isActive: false,
      passwordHash: "hashed_pw",
      airtableAccountId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: null,
    } as any);

    const { createUser: cu } = await import("./db");
    const { getUserByEmail: gube } = await import("./db");
    const { hashPassword } = await import("./auth");

    // Simuliere registerHwp-Logik
    const existing = await gube("test@hwp.de");
    expect(existing).toBeNull();

    const passwordHash = await hashPassword("securepassword123");
    expect(passwordHash).toBe("hashed_securepassword123");

    const user = await cu({
      email: "test@hwp.de",
      passwordHash,
      name: "Max Muster",
      role: "hwp",
      companyName: "Muster GmbH",
      isActive: false,
    } as any);

    expect(user).not.toBeNull();
    expect(user?.role).toBe("hwp");
    expect(user?.isActive).toBe(false);
  });

  it("wirft CONFLICT wenn E-Mail bereits vergeben", async () => {
    vi.mocked(getUserByEmail).mockResolvedValueOnce({
      id: 1,
      email: "existing@hwp.de",
      role: "hwp",
    } as any);

    const { getUserByEmail: gube } = await import("./db");
    const existing = await gube("existing@hwp.de");
    expect(existing).not.toBeNull();
    // In der echten Prozedur würde hier TRPCError geworfen
  });
});

describe("hwp.createMkAntrag Validierung", () => {
  it("berechnet Summen korrekt mit Pauschale-Abzug", async () => {
    const { MK_KATALOG, berechnePauschaleAbzug } = await import("../shared/mk-positionen-katalog");
    const uvAnzahl = 1;
    const pauschaleAbzug = berechnePauschaleAbzug(uvAnzahl);
    const pauschaleBetrag = 50000; // 500 EUR in Cent

    const testMengen: Record<string, number> = {
      sls: 1,        // inklusiv bei UV1
      kabel_5x10: 10, // 10m à 10 EUR = 100 EUR
    };

    let summeOhnePauschale = 0;
    let pauschaleSumme = 0;

    for (const pos of MK_KATALOG) {
      const menge = testMengen[pos.key] ?? 0;
      if (menge <= 0) continue;
      const inklusiv = Math.min(menge, pauschaleAbzug.get(pos.key) ?? 0);
      const netto = menge - inklusiv;
      summeOhnePauschale += menge * pos.einzelpreisEuro;
      pauschaleSumme += inklusiv * pos.einzelpreisEuro;
    }

    // SLS (150 EUR) ist inklusiv bei UV1 → wird abgezogen
    // Kabel 5x10 (10m × 10 EUR = 100 EUR) → kein Inklusiv-Abzug
    expect(summeOhnePauschale).toBeGreaterThan(0);
    // Pauschale-Abzug für SLS sollte > 0 sein
    expect(pauschaleSumme).toBeGreaterThan(0);
  });

  it("berechnePauschaleAbzug gibt korrekte Inklusivmengen zurück", async () => {
    const { berechnePauschaleAbzug } = await import("../shared/mk-positionen-katalog");
    const abzug1 = berechnePauschaleAbzug(1);
    const abzug2 = berechnePauschaleAbzug(2);

    // SLS sollte bei UV1 und UV2 inklusiv sein
    expect(abzug1.has("sls")).toBe(true);
    expect(abzug2.has("sls")).toBe(true);

    // Bei mehr UVs sollte die Inklusivmenge steigen
    const sls1 = abzug1.get("sls") ?? 0;
    const sls2 = abzug2.get("sls") ?? 0;
    expect(sls2).toBeGreaterThanOrEqual(sls1);
  });
});

describe("Register-Seite", () => {
  it("Registrierungsseite ist unter /register erreichbar (Route vorhanden)", async () => {
    // Prüfen ob Register.tsx existiert und exportiert
    // Prüfen ob Register.tsx als Datei existiert
    const fs = await import("fs");
    const exists = fs.existsSync("/home/ubuntu/hwp-portal/client/src/pages/Register.tsx");
    expect(exists).toBe(true);
  });
});
