import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  defaultPermissions,
  InsertUser,
  InsertUserHwpAssignment,
  PermissionSet,
  rolePermissions,
  teams,
  teamMitglieder,
  teamHwpZuordnungen,
  mkRechnungen,
  mkPositionen,
  mkNachtraege,
  User,
  userHwpAssignments,
  users,
  Team,
  TeamMitglied,
  TeamHwpZuordnung,
} from "../drizzle/schema";
import * as airtableClient from "./airtableClient";

let _db: ReturnType<typeof drizzle> | null = null;

type MemoryRolePermission = {
  id: number;
  role: User["role"];
  permissions: PermissionSet;
  updatedAt: Date;
  updatedBy: number | null;
};

type MemoryHwpAssignment = {
  id: number;
  userId: number;
  hwpAccountId: string;
  hwpName: string;
  createdAt: Date;
};

type MemoryTeam = Team & { mitglieder?: any[]; hwpZuordnungen?: any[] };
type MemoryTeamMitglied = TeamMitglied & { userName?: string; userEmail?: string; userRole?: string };
type MemoryMkRechnung = any;
type MemoryMkPosition = any;
type MemoryMkNachtrag = any;

const memoryState: {
  users: User[];
  rolePermissions: MemoryRolePermission[];
  assignments: MemoryHwpAssignment[];
  teams: MemoryTeam[];
  teamMitglieder: MemoryTeamMitglied[];
  teamHwpZuordnungen: any[];
  mkRechnungen: MemoryMkRechnung[];
  mkPositionen: MemoryMkPosition[];
  mkNachtraege: MemoryMkNachtrag[];
  nextUserId: number;
  nextRolePermissionId: number;
  nextAssignmentId: number;
  nextTeamId: number;
  nextTeamMitgliedId: number;
  nextTeamHwpId: number;
  nextMkRechnungId: number;
  nextMkPositionId: number;
  nextMkNachtragId: number;
} = {
  users: [],
  rolePermissions: [],
  assignments: [],
  teams: [],
  teamMitglieder: [],
  teamHwpZuordnungen: [],
  mkRechnungen: [],
  mkPositionen: [],
  mkNachtraege: [],
  nextUserId: 1,
  nextRolePermissionId: 1,
  nextAssignmentId: 1,
  nextTeamId: 1,
  nextTeamMitgliedId: 1,
  nextTeamHwpId: 1,
  nextMkRechnungId: 1,
  nextMkPositionId: 1,
  nextMkNachtragId: 1,
};

function useMemoryFallback() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}

function normalizeEmail(email: string) {
  return email.toLowerCase();
}

const airtableUserIdMap = new Map<number, string>();
const airtableTeamIdMap = new Map<number, string>();

function isAirtableUsersEnabled() {
  return process.env.USE_AIRTABLE_USERS === "true";
}

function isAirtableTeamsEnabled() {
  return process.env.USE_AIRTABLE_TEAMS === "true" || isAirtableUsersEnabled();
}

function stableNumericId(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return Math.max(1, hash % 2147483647);
}

function parseHwpAccountLines(value: unknown): Array<{ hwpAccountId: string; hwpName: string }> {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v).trim())
      .filter(Boolean)
      .map((line) => {
        const [hwpAccountId, hwpName] = line.split("|").map((s) => s.trim());
        return {
          hwpAccountId,
          hwpName: hwpName || hwpAccountId,
        };
      });
  }

  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [hwpAccountId, hwpName] = line.split("|").map((s) => s.trim());
    return {
      hwpAccountId,
      hwpName: hwpName || hwpAccountId,
    };
  });
}

function formatHwpAccountLines(items: Array<{ hwpAccountId: string; hwpName: string }>): string {
  return items.map((item) => `${item.hwpAccountId}|${item.hwpName}`).join("\n");
}

function mapAirtableUserToUser(at: any): User {
  const recordId = String(at.id ?? "");
  const numericId = stableNumericId(`user:${recordId}`);
  if (recordId) airtableUserIdMap.set(numericId, recordId);

  return {
    id: numericId,
    email: String(at.email ?? ""),
    passwordHash: String(at.passwordHash ?? ""),
    name: String(at.name ?? ""),
    role: ((at.role as User["role"]) ?? "hwp"),
    airtableAccountId: at.airtableAccountId ? String(at.airtableAccountId) : null,
    companyName: at.companyName ? String(at.companyName) : null,
    isActive: Boolean(at.isActive),
    createdAt: at.createdAt ? new Date(at.createdAt) : new Date(),
    updatedAt: at.updatedAt ? new Date(at.updatedAt) : new Date(),
    lastSignedIn: at.lastSignedIn ? new Date(at.lastSignedIn) : null,
  };
}

async function resolveAirtableUserRecordId(userId: number): Promise<string | undefined> {
  const cached = airtableUserIdMap.get(userId);
  if (cached) return cached;

  const usersFromAirtable = await airtableClient.getAllUsersAirtable();
  for (const at of usersFromAirtable) {
    const numericId = stableNumericId(`user:${String(at.id)}`);
    airtableUserIdMap.set(numericId, String(at.id));
    if (numericId === userId) return String(at.id);
  }
  return undefined;
}

function mapAirtableTeamToTeam(at: any): Team {
  const recordId = String(at.id ?? "");
  const numericId = stableNumericId(`team:${recordId}`);
  if (recordId) airtableTeamIdMap.set(numericId, recordId);

  const createdByRecordId = Array.isArray(at.createdBy)
    ? String(at.createdBy[0] ?? "")
    : String(at.createdBy ?? "");
  const createdBy = createdByRecordId
    ? stableNumericId(`user:${createdByRecordId}`)
    : 0;

  return {
    id: numericId,
    name: String(at.name ?? ""),
    beschreibung: at.beschreibung ? String(at.beschreibung) : null,
    createdBy,
    createdAt: at.createdAt ? new Date(at.createdAt) : new Date(),
    updatedAt: at.updatedAt ? new Date(at.updatedAt) : new Date(),
  };
}

async function resolveAirtableTeamRecordId(teamId: number): Promise<string | undefined> {
  const cached = airtableTeamIdMap.get(teamId);
  if (cached) return cached;

  const teamsFromAirtable = await airtableClient.getAllTeamsAirtable();
  for (const at of teamsFromAirtable) {
    const numericId = stableNumericId(`team:${String(at.id)}`);
    airtableTeamIdMap.set(numericId, String(at.id));
    if (numericId === teamId) return String(at.id);
  }
  return undefined;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User Queries ─────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  if (isAirtableUsersEnabled()) {
    const at = await airtableClient.getUserByEmailAirtable(email);
    if (!at) return undefined;
    return mapAirtableUserToUser(at);
  }

  if (useMemoryFallback()) {
    return memoryState.users.find((u) => u.email === normalizeEmail(email));
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return result[0] ?? undefined;
}

export async function getUserById(id: number) {
  if (isAirtableUsersEnabled()) {
    const recordId = await resolveAirtableUserRecordId(id);
    if (!recordId) return undefined;
    const at = await airtableClient.getUserByIdAirtable(recordId);
    return mapAirtableUserToUser(at);
  }

  if (useMemoryFallback()) {
    return memoryState.users.find((u) => u.id === id);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] ?? undefined;
}

export async function getAllUsers() {
  if (isAirtableUsersEnabled()) {
    const atUsers = await airtableClient.getAllUsersAirtable();
    return atUsers.map(mapAirtableUserToUser);
  }

  if (useMemoryFallback()) {
    return [...memoryState.users].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(users.createdAt);
}

export async function createUser(data: InsertUser) {
  if (isAirtableUsersEnabled()) {
    const fields: Record<string, unknown> = {
      Name: data.name,
      Email: normalizeEmail(data.email),
      "Password Hash": data.passwordHash,
      Role: data.role ?? "hwp",
      "Airtable Account ID": data.airtableAccountId ?? null,
      "Company Name": data.companyName ?? null,
      "Is Active": data.isActive ?? true,
    };

    try {
      const at = await airtableClient.createUserAirtable(fields);
      if (!at) throw new Error("Airtable returned no record");
      return mapAirtableUserToUser(at);
    } catch (err) {
      console.error("[Airtable] Failed to create user:", err);
      // Rethrow so callers (TRPC) receive an error instead of assuming success
      throw err;
    }
  }

  if (useMemoryFallback()) {
    const now = new Date();
    const newUser: User = {
      id: memoryState.nextUserId++,
      email: normalizeEmail(data.email),
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role ?? "hwp",
      airtableAccountId: data.airtableAccountId ?? null,
      companyName: data.companyName ?? null,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: data.lastSignedIn ?? null,
    };

    memoryState.users.push(newUser);
    return newUser;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values(data);
  return getUserByEmail(data.email);
}

export async function updateUser(
  id: number,
  data: Partial<Omit<InsertUser, "id" | "createdAt">>
) {
  if (isAirtableUsersEnabled()) {
    const recordId = await resolveAirtableUserRecordId(id);
    if (!recordId) return undefined;

    const fields: Record<string, unknown> = {};
    if (data.name !== undefined) fields.Name = data.name;
    if (data.email !== undefined) fields.Email = normalizeEmail(data.email);
    if (data.passwordHash !== undefined) fields["Password Hash"] = data.passwordHash;
    if (data.role !== undefined) fields.Role = data.role;
    if (data.airtableAccountId !== undefined)
      fields["Airtable Account ID"] = data.airtableAccountId;
    if (data.companyName !== undefined) fields["Company Name"] = data.companyName;
    if (data.isActive !== undefined) fields["Is Active"] = data.isActive;
    if (data.lastSignedIn !== undefined)
      fields["Last Signed In"] = data.lastSignedIn
        ? new Date(data.lastSignedIn).toISOString()
        : null;

    const at = await airtableClient.updateUserAirtable(recordId, fields);
    return mapAirtableUserToUser(at);
  }

  if (useMemoryFallback()) {
    const idx = memoryState.users.findIndex((u) => u.id === id);
    if (idx < 0) return undefined;

    const existing = memoryState.users[idx];
    const updated: User = {
      ...existing,
      ...data,
      email: data.email ? normalizeEmail(data.email) : existing.email,
      updatedAt: new Date(),
    };

    memoryState.users[idx] = updated;
    return updated;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(data).where(eq(users.id, id));
  return getUserById(id);
}

export async function deleteUser(id: number) {
  if (isAirtableUsersEnabled()) {
    const recordId = await resolveAirtableUserRecordId(id);
    if (!recordId) return;
    await airtableClient.deleteUserAirtable(recordId);
    airtableUserIdMap.delete(id);
    return;
  }

  if (useMemoryFallback()) {
    memoryState.users = memoryState.users.filter((u) => u.id !== id);
    memoryState.assignments = memoryState.assignments.filter(
      (a) => a.userId !== id
    );
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(users).where(eq(users.id, id));
}

export async function updateLastSignedIn(id: number) {
  if (isAirtableUsersEnabled()) {
    await updateUser(id, { lastSignedIn: new Date() });
    return;
  }

  if (useMemoryFallback()) {
    const user = memoryState.users.find((u) => u.id === id);
    if (!user) return;
    user.lastSignedIn = new Date();
    user.updatedAt = new Date();
    return;
  }

  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, id));
}

// ─── Role Permissions Queries ─────────────────────────────────────────────────

export async function getRolePermissions() {
  if (useMemoryFallback()) {
    return memoryState.rolePermissions;
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(rolePermissions);
}

export async function getRolePermission(role: string) {
  if (useMemoryFallback()) {
    return memoryState.rolePermissions.find((p) => p.role === role);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(rolePermissions)
    .where(eq(rolePermissions.role, role as any))
    .limit(1);
  return result[0] ?? undefined;
}

export async function upsertRolePermission(
  role: string,
  permissions: PermissionSet,
  updatedBy: number
) {
  if (useMemoryFallback()) {
    const existing = memoryState.rolePermissions.find((p) => p.role === role);
    if (existing) {
      existing.permissions = permissions;
      existing.updatedBy = updatedBy;
      existing.updatedAt = new Date();
      return;
    }

    memoryState.rolePermissions.push({
      id: memoryState.nextRolePermissionId++,
      role: role as User["role"],
      permissions,
      updatedBy,
      updatedAt: new Date(),
    });
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(rolePermissions)
    .values({ role: role as any, permissions, updatedBy })
    .onDuplicateKeyUpdate({ set: { permissions, updatedBy } });
}

export async function initDefaultPermissions() {
  if (useMemoryFallback()) {
    for (const [role, perms] of Object.entries(defaultPermissions)) {
      const existing = memoryState.rolePermissions.find((p) => p.role === role);
      if (!existing) {
        memoryState.rolePermissions.push({
          id: memoryState.nextRolePermissionId++,
          role: role as User["role"],
          permissions: perms,
          updatedBy: null,
          updatedAt: new Date(),
        });
      }
    }
    return;
  }

  const db = await getDb();
  if (!db) return;
  for (const [role, perms] of Object.entries(defaultPermissions)) {
    const existing = await getRolePermission(role);
    if (!existing) {
      await db
        .insert(rolePermissions)
        .values({ role: role as any, permissions: perms });
    }
  }
}

// ─── HWP-Zuordnungen (KAM/TOM → HWP-Partner) ───────────────────────────────────────────────

export async function getHwpAssignmentsForUser(userId: number) {
  if (isAirtableUsersEnabled()) {
    const user = await getUserById(userId);
    if (!user) return [];
    const at = await airtableClient.getUserByEmailAirtable(user.email);
    if (!at) return [];
    const parsed = parseHwpAccountLines(at.assignedHwpAccounts);
    return parsed.map((item, idx) => ({
      id: idx + 1,
      userId,
      hwpAccountId: item.hwpAccountId,
      hwpName: item.hwpName,
      createdAt: new Date(),
    }));
  }

  if (useMemoryFallback()) {
    return memoryState.assignments.filter((a) => a.userId === userId);
  }

  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userHwpAssignments)
    .where(eq(userHwpAssignments.userId, userId));
}

export async function setHwpAssignmentsForUser(
  userId: number,
  assignments: Array<{ hwpAccountId: string; hwpName: string }>
) {
  if (isAirtableUsersEnabled()) {
    const recordId = await resolveAirtableUserRecordId(userId);
    if (!recordId) return [];

    const lines = formatHwpAccountLines(assignments);
    await airtableClient.updateUserAirtable(recordId, {
      "Assigned HWP Accounts": lines,
    });
    return getHwpAssignmentsForUser(userId);
  }

  if (useMemoryFallback()) {
    memoryState.assignments = memoryState.assignments.filter(
      (a) => a.userId !== userId
    );
    for (const assignment of assignments) {
      memoryState.assignments.push({
        id: memoryState.nextAssignmentId++,
        userId,
        hwpAccountId: assignment.hwpAccountId,
        hwpName: assignment.hwpName,
        createdAt: new Date(),
      });
    }
    return getHwpAssignmentsForUser(userId);
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Alle alten Zuordnungen löschen
  await db.delete(userHwpAssignments).where(eq(userHwpAssignments.userId, userId));
  // Neue Zuordnungen einfügen
  if (assignments.length > 0) {
    await db.insert(userHwpAssignments).values(
      assignments.map((a) => ({ userId, hwpAccountId: a.hwpAccountId, hwpName: a.hwpName }))
    );
  }
  return getHwpAssignmentsForUser(userId);
}

export async function getAllHwpAssignments() {
  if (isAirtableUsersEnabled()) {
    const usersFromAirtable = await airtableClient.getAllUsersAirtable();
    const output: Array<{
      id: number;
      userId: number;
      hwpAccountId: string;
      hwpName: string;
      createdAt: Date;
    }> = [];

    let nextId = 1;
    for (const at of usersFromAirtable) {
      const userId = stableNumericId(`user:${String(at.id)}`);
      const parsed = parseHwpAccountLines(at.assignedHwpAccounts);
      for (const item of parsed) {
        output.push({
          id: nextId++,
          userId,
          hwpAccountId: item.hwpAccountId,
          hwpName: item.hwpName,
          createdAt: new Date(),
        });
      }
    }
    return output;
  }

  if (useMemoryFallback()) {
    return memoryState.assignments;
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(userHwpAssignments);
}

// ─── Teams (In-Memory Fallback) ────────────────────────────────────────────────

export async function getAllTeams() {
  if (isAirtableTeamsEnabled()) {
    const teamsFromAirtable = await airtableClient.getAllTeamsAirtable();
    return teamsFromAirtable.map(mapAirtableTeamToTeam);
  }

  if (useMemoryFallback()) {
    return memoryState.teams;
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(teams);
}

export async function getTeamById(id: number) {
  if (isAirtableTeamsEnabled()) {
    const recordId = await resolveAirtableTeamRecordId(id);
    if (!recordId) return undefined;
    const at = await airtableClient.getTeamByIdAirtable(recordId);
    return mapAirtableTeamToTeam(at);
  }

  if (useMemoryFallback()) {
    return memoryState.teams.find((t) => t.id === id);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return result[0];
}

export async function createTeam(data: { name: string; beschreibung?: string | null; createdBy: number }) {
  if (isAirtableTeamsEnabled()) {
    const createdByRecordId = await resolveAirtableUserRecordId(data.createdBy);
    const fields: Record<string, unknown> = {
      "Team Name": data.name,
      Beschreibung: data.beschreibung ?? null,
    };
    if (createdByRecordId) {
      fields["Created By"] = [createdByRecordId];
    }

    const at = await airtableClient.createTeamAirtable(fields);
    return mapAirtableTeamToTeam(at) as any;
  }

  if (useMemoryFallback()) {
    const now = new Date();
    const newTeam: MemoryTeam = {
      id: memoryState.nextTeamId++,
      name: data.name,
      beschreibung: data.beschreibung ?? null,
      createdBy: data.createdBy,
      createdAt: now,
      mitglieder: [],
      hwpZuordnungen: [],
    } as any;
    memoryState.teams.push(newTeam);
    return newTeam;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const newId = memoryState.nextTeamId++;
  await db.insert(teams).values({
    id: newId,
    name: data.name,
    beschreibung: data.beschreibung ?? null,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return getTeamById(newId);
}

export async function updateTeam(id: number, data: { name: string; beschreibung?: string | null }) {
  if (isAirtableTeamsEnabled()) {
    const recordId = await resolveAirtableTeamRecordId(id);
    if (!recordId) return undefined;
    const at = await airtableClient.updateTeamAirtable(recordId, {
      "Team Name": data.name,
      Beschreibung: data.beschreibung ?? null,
    });
    return mapAirtableTeamToTeam(at) as any;
  }

  if (useMemoryFallback()) {
    const team = memoryState.teams.find((t) => t.id === id);
    if (!team) return undefined;
    team.name = data.name;
    team.beschreibung = data.beschreibung ?? null;
    return team;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(teams).set({ name: data.name, beschreibung: data.beschreibung ?? null }).where(eq(teams.id, id));
  return getTeamById(id);
}

export async function deleteTeam(id: number) {
  if (isAirtableTeamsEnabled()) {
    const recordId = await resolveAirtableTeamRecordId(id);
    if (!recordId) return;
    await airtableClient.deleteTeamAirtable(recordId);
    airtableTeamIdMap.delete(id);
    return;
  }

  if (useMemoryFallback()) {
    memoryState.teams = memoryState.teams.filter((t) => t.id !== id);
    memoryState.teamMitglieder = memoryState.teamMitglieder.filter((m) => m.teamId !== id);
    memoryState.teamHwpZuordnungen = memoryState.teamHwpZuordnungen.filter((z) => z.teamId !== id);
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamMitglieder).where(eq(teamMitglieder.teamId, id));
  await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, id));
  await db.delete(teams).where(eq(teams.id, id));
}

export async function getTeamMitgliederWithUsers(teamId: number) {
  if (isAirtableTeamsEnabled()) {
    const recordId = await resolveAirtableTeamRecordId(teamId);
    if (!recordId) return [];

    const usersFromAirtable = await airtableClient.getTeamMitgliederWithUsersAirtable(recordId);
    return usersFromAirtable.map((u: any, index: number) => {
      const mapped = mapAirtableUserToUser(u);
      return {
        id: index + 1,
        teamId,
        userId: mapped.id,
        teamRolle: ["kam", "tom", "tl"].includes(mapped.role)
          ? mapped.role
          : "kam",
        createdAt: new Date(),
      };
    });
  }

  if (useMemoryFallback()) {
    return memoryState.teamMitglieder.filter((m) => m.teamId === teamId);
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(teamMitglieder).where(eq(teamMitglieder.teamId, teamId));
}

export async function setTeamMitglieder(teamId: number, mitglieder: Array<{ userId: number; teamRolle: string }>) {
  if (isAirtableTeamsEnabled()) {
    const teamRecordId = await resolveAirtableTeamRecordId(teamId);
    if (!teamRecordId) return [];

    const userRecordIds: string[] = [];
    for (const m of mitglieder) {
      const recordId = await resolveAirtableUserRecordId(m.userId);
      if (recordId) userRecordIds.push(recordId);
    }

    await airtableClient.setTeamMitgliederAirtable(teamRecordId, userRecordIds);
    return getTeamMitgliederWithUsers(teamId);
  }

  if (useMemoryFallback()) {
    memoryState.teamMitglieder = memoryState.teamMitglieder.filter((m) => m.teamId !== teamId);
    for (const m of mitglieder) {
      memoryState.teamMitglieder.push({
        id: memoryState.nextTeamMitgliedId++,
        teamId,
        userId: m.userId,
        teamRolle: m.teamRolle as any,
        createdAt: new Date(),
      } as any);
    }
    return getTeamMitgliederWithUsers(teamId);
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamMitglieder).where(eq(teamMitglieder.teamId, teamId));
  if (mitglieder.length > 0) {
    await db.insert(teamMitglieder).values(
      mitglieder.map((m) => ({
        teamId,
        userId: m.userId,
        teamRolle: m.teamRolle as any,
      }))
    );
  }
  return getTeamMitgliederWithUsers(teamId);
}

export async function getTeamHwpZuordnungen(teamId: number) {
  if (isAirtableTeamsEnabled()) {
    const teamRecordId = await resolveAirtableTeamRecordId(teamId);
    if (!teamRecordId) return [];
    const items = await airtableClient.getTeamHwpZuordnungenAirtable(teamRecordId);
    const parsed = parseHwpAccountLines(items);
    return parsed.map((item, idx) => ({
      id: idx + 1,
      teamId,
      hwpAccountId: item.hwpAccountId,
      hwpName: item.hwpName,
      createdAt: new Date(),
    }));
  }

  if (useMemoryFallback()) {
    return memoryState.teamHwpZuordnungen.filter((z) => z.teamId === teamId);
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, teamId));
}

export async function setTeamHwpZuordnungen(teamId: number, hwps: Array<{ hwpAccountId: string; hwpName: string }>) {
  if (isAirtableTeamsEnabled()) {
    const teamRecordId = await resolveAirtableTeamRecordId(teamId);
    if (!teamRecordId) return [];

    const lines = formatHwpAccountLines(hwps);
    await airtableClient.setTeamHwpZuordnungenAirtable(teamRecordId, lines);
    return getTeamHwpZuordnungen(teamId);
  }

  if (useMemoryFallback()) {
    memoryState.teamHwpZuordnungen = memoryState.teamHwpZuordnungen.filter((z) => z.teamId !== teamId);
    for (const hwp of hwps) {
      memoryState.teamHwpZuordnungen.push({
        id: memoryState.nextTeamHwpId++,
        teamId,
        hwpAccountId: hwp.hwpAccountId,
        hwpName: hwp.hwpName,
        createdAt: new Date(),
      });
    }
    return getTeamHwpZuordnungen(teamId);
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamHwpZuordnungen).where(eq(teamHwpZuordnungen.teamId, teamId));
  if (hwps.length > 0) {
    await db.insert(teamHwpZuordnungen).values(
      hwps.map((h) => ({
        teamId,
        hwpAccountId: h.hwpAccountId,
        hwpName: h.hwpName,
      }))
    );
  }
  return getTeamHwpZuordnungen(teamId);
}

// ─── Mehrkosten Workflow (In-Memory Fallback) ──────────────────────────────────

export async function getMkRechnungById(id: number) {
  if (useMemoryFallback()) {
    return memoryState.mkRechnungen.find((r) => r.id === id);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mkRechnungen).where(eq(mkRechnungen.id, id)).limit(1);
  return result[0];
}

export async function createMkRechnung(data: any) {
  if (useMemoryFallback()) {
    const now = new Date();
    const newRechnung = {
      id: memoryState.nextMkRechnungId++,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    memoryState.mkRechnungen.push(newRechnung);
    return newRechnung;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mkRechnungen).values(data);
  const result = await db.select().from(mkRechnungen).where(eq(mkRechnungen.id, memoryState.nextMkRechnungId - 1)).limit(1);
  return result[0];
}

export async function updateMkRechnung(id: number, data: any) {
  if (useMemoryFallback()) {
    const rechnung = memoryState.mkRechnungen.find((r) => r.id === id);
    if (!rechnung) return undefined;
    Object.assign(rechnung, data, { updatedAt: new Date() });
    return rechnung;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(mkRechnungen).set(data).where(eq(mkRechnungen.id, id));
  return getMkRechnungById(id);
}

export async function getMkPositionenForRechnung(rechnungId: number) {
  if (useMemoryFallback()) {
    return memoryState.mkPositionen.filter((p) => p.rechnungId === rechnungId);
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(mkPositionen).where(eq(mkPositionen.rechnungId, rechnungId));
}

export async function createMkPosition(data: any) {
  if (useMemoryFallback()) {
    const newPosition = {
      id: memoryState.nextMkPositionId++,
      ...data,
      createdAt: new Date(),
    };
    memoryState.mkPositionen.push(newPosition);
    return newPosition;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mkPositionen).values(data);
  return data;
}

export async function deleteMkPositionen(rechnungId: number) {
  if (useMemoryFallback()) {
    memoryState.mkPositionen = memoryState.mkPositionen.filter((p) => p.rechnungId !== rechnungId);
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mkPositionen).where(eq(mkPositionen.rechnungId, rechnungId));
}

export async function deleteMkPositionenByQuelle(rechnungId: number, quelle: string) {
  if (useMemoryFallback()) {
    memoryState.mkPositionen = memoryState.mkPositionen.filter(
      (p) => !(p.rechnungId === rechnungId && p.quelle === quelle),
    );
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mkPositionen).where(and(eq(mkPositionen.rechnungId, rechnungId), eq(mkPositionen.quelle, quelle as any)));
}

export async function getMkNachtraegeForRechnung(rechnungId: number) {
  if (useMemoryFallback()) {
    return memoryState.mkNachtraege.filter((n) => n.rechnungId === rechnungId);
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(mkNachtraege).where(eq(mkNachtraege.rechnungId, rechnungId));
}

export async function createMkNachtrag(data: any) {
  if (useMemoryFallback()) {
    const newNachtrag = {
      id: memoryState.nextMkNachtragId++,
      ...data,
      createdAt: new Date(),
    };
    memoryState.mkNachtraege.push(newNachtrag);
    return newNachtrag;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mkNachtraege).values(data);
  return data;
}

// Helper: Get mk_rechnungen by order numbers
export async function getMkRechnungenByOrderNumbers(orderNumbers: string[]) {
  if (orderNumbers.length === 0) return [];

  if (useMemoryFallback()) {
    return memoryState.mkRechnungen.filter((r) => orderNumbers.includes(String(r.orderNumber ?? "")));
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(mkRechnungen).where(inArray(mkRechnungen.orderNumber, orderNumbers));
}

export async function getMkRechnungByOrderNumber(orderNumber: string) {
  if (useMemoryFallback()) {
    return memoryState.mkRechnungen.find((r) => r.orderNumber === orderNumber);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mkRechnungen).where(eq(mkRechnungen.orderNumber, orderNumber)).limit(1);
  return result[0];
}

export async function getLatestMkNachtragForRechnung(rechnungId: number) {
  const nachtraege = await getMkNachtraegeForRechnung(rechnungId);
  if (!nachtraege.length) return undefined;
  return [...nachtraege].sort((a: any, b: any) => {
    const da = new Date(a.eingereichtAt ?? a.createdAt ?? 0).getTime();
    const db = new Date(b.eingereichtAt ?? b.createdAt ?? 0).getTime();
    return db - da;
  })[0];
}

export async function updateMkNachtrag(id: number, data: any) {
  if (useMemoryFallback()) {
    const nachtrag = memoryState.mkNachtraege.find((n) => n.id === id);
    if (!nachtrag) return undefined;
    Object.assign(nachtrag, data);
    return nachtrag;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(mkNachtraege).set(data).where(eq(mkNachtraege.id, id));
  const result = await db.select().from(mkNachtraege).where(eq(mkNachtraege.id, id)).limit(1);
  return result[0];
}

export async function getMkNachtragById(id: number) {
  if (useMemoryFallback()) {
    return memoryState.mkNachtraege.find((n) => n.id === id);
  }

  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mkNachtraege).where(eq(mkNachtraege.id, id)).limit(1);
  return result[0];
}

export async function getAllMkRechnungen() {
  if (useMemoryFallback()) {
    return [...memoryState.mkRechnungen];
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(mkRechnungen);
}

export async function getAllMkNachtraege() {
  if (useMemoryFallback()) {
    return [...memoryState.mkNachtraege];
  }

  const db = await getDb();
  if (!db) return [];
  return db.select().from(mkNachtraege);
}

export async function deleteMkNachtraegeForRechnung(rechnungId: number) {
  if (useMemoryFallback()) {
    memoryState.mkNachtraege = memoryState.mkNachtraege.filter((n) => n.rechnungId !== rechnungId);
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mkNachtraege).where(eq(mkNachtraege.rechnungId, rechnungId));
}

export async function deleteMkRechnung(id: number) {
  if (useMemoryFallback()) {
    memoryState.mkRechnungen = memoryState.mkRechnungen.filter((r) => r.id !== id);
    return;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(mkRechnungen).where(eq(mkRechnungen.id, id));
}

// Helper: Get all teams a user is member of
export async function getTeamIdsForUser(userId: number): Promise<number[]> {
  if (isAirtableTeamsEnabled()) {
    const userRecordId = await resolveAirtableUserRecordId(userId);
    if (!userRecordId) return [];
    const teamRecordIds = await airtableClient.getTeamIdsForUserAirtable(userRecordId);
    return teamRecordIds.map((id) => {
      const numericId = stableNumericId(`team:${String(id)}`);
      airtableTeamIdMap.set(numericId, String(id));
      return numericId;
    });
  }

  if (useMemoryFallback()) {
    return memoryState.teamMitglieder
      .filter((m) => m.userId === userId)
      .map((m) => m.teamId);
  }

  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select({ teamId: teamMitglieder.teamId }).from(teamMitglieder).where(eq(teamMitglieder.userId, userId));
  return memberships.map((m) => m.teamId);
}
