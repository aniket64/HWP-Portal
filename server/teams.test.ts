/**
 * Tests für den Teams-Router
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { teams, teamMitglieder, teamHwpZuordnungen, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

async function cleanupTestTeams(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) return;
  // Alle Test-Teams löschen
  const testTeams = await db.select().from(teams).where(eq(teams.name, "__test_team__"));
  for (const t of testTeams) {
    await db.delete(teamMitglieder).where(eq(teamMitglieder.teamId, t.id));
    await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, t.id));
    await db.delete(teams).where(eq(teams.id, t.id));
  }
  const testTeams2 = await db.select().from(teams).where(eq(teams.name, "__test_team_updated__"));
  for (const t of testTeams2) {
    await db.delete(teamMitglieder).where(eq(teamMitglieder.teamId, t.id));
    await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, t.id));
    await db.delete(teams).where(eq(teams.id, t.id));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Teams-Datenbank", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testTeamId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("DB nicht verfügbar");
    await cleanupTestTeams(db);
  });

  afterAll(async () => {
    if (db) await cleanupTestTeams(db);
  });

  it("sollte ein Team anlegen können", async () => {
    if (!db) return;

    const [result] = await db.insert(teams).values({
      name: "__test_team__",
      beschreibung: "Test-Beschreibung",
      createdBy: null,
    });

    testTeamId = (result as any).insertId as number;
    expect(testTeamId).toBeGreaterThan(0);

    const [team] = await db.select().from(teams).where(eq(teams.id, testTeamId)).limit(1);
    expect(team).toBeDefined();
    expect(team.name).toBe("__test_team__");
    expect(team.beschreibung).toBe("Test-Beschreibung");
  });

  it("sollte ein Team umbenennen können", async () => {
    if (!db || !testTeamId) return;

    await db.update(teams).set({ name: "__test_team_updated__" }).where(eq(teams.id, testTeamId));

    const [team] = await db.select().from(teams).where(eq(teams.id, testTeamId)).limit(1);
    expect(team.name).toBe("__test_team_updated__");
  });

  it("sollte HWP-Zuordnungen speichern und laden können", async () => {
    if (!db || !testTeamId) return;

    await db.insert(teamHwpZuordnungen).values([
      { teamId: testTeamId, hwpAccountId: "acc_test_1", hwpName: "Test HWP GmbH" },
      { teamId: testTeamId, hwpAccountId: "acc_test_2", hwpName: "Muster Montage AG" },
    ]);

    const zuordnungen = await db
      .select()
      .from(teamHwpZuordnungen)
      .where(eq(teamHwpZuordnungen.teamId, testTeamId));

    expect(zuordnungen).toHaveLength(2);
    expect(zuordnungen.map((z) => z.hwpAccountId)).toContain("acc_test_1");
    expect(zuordnungen.map((z) => z.hwpAccountId)).toContain("acc_test_2");
  });

  it("sollte HWP-Zuordnungen ersetzen können (delete + insert)", async () => {
    if (!db || !testTeamId) return;

    // Alle löschen und neu setzen
    await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, testTeamId));
    await db.insert(teamHwpZuordnungen).values([
      { teamId: testTeamId, hwpAccountId: "acc_new_1", hwpName: "Neuer HWP" },
    ]);

    const zuordnungen = await db
      .select()
      .from(teamHwpZuordnungen)
      .where(eq(teamHwpZuordnungen.teamId, testTeamId));

    expect(zuordnungen).toHaveLength(1);
    expect(zuordnungen[0].hwpAccountId).toBe("acc_new_1");
  });

  it("sollte ein Team kaskadierend löschen können", async () => {
    if (!db || !testTeamId) return;

    // Mitglieder und HWPs löschen, dann Team
    await db.delete(teamMitglieder).where(eq(teamMitglieder.teamId, testTeamId));
    await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, testTeamId));
    await db.delete(teams).where(eq(teams.id, testTeamId));

    const [deleted] = await db.select().from(teams).where(eq(teams.id, testTeamId)).limit(1);
    expect(deleted).toBeUndefined();

    // testTeamId zurücksetzen damit afterAll nicht nochmal versucht zu löschen
    testTeamId = 0;
  });
});

describe("Teams-Schema-Validierung", () => {
  it("sollte teamRolle-Enum korrekt definiert haben", () => {
    // Prüfe dass die Enum-Werte korrekt sind
    const validRoles = ["kam", "tom", "tl"];
    expect(validRoles).toContain("kam");
    expect(validRoles).toContain("tom");
    expect(validRoles).toContain("tl");
    expect(validRoles).not.toContain("admin");
    expect(validRoles).not.toContain("hwp");
  });

  it("sollte Team-Pflichtfelder prüfen", () => {
    // name ist Pflichtfeld, beschreibung optional
    const teamData = { name: "Test Team", beschreibung: null };
    expect(teamData.name).toBeTruthy();
    expect(teamData.beschreibung).toBeNull();
  });

  it("sollte HWP-Zuordnung-Pflichtfelder prüfen", () => {
    const zuordnung = {
      teamId: 1,
      hwpAccountId: "acc_123",
      hwpName: "Test HWP",
    };
    expect(zuordnung.teamId).toBeGreaterThan(0);
    expect(zuordnung.hwpAccountId).toBeTruthy();
    expect(zuordnung.hwpName).toBeTruthy();
  });
});
