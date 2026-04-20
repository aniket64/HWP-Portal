import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createUser,
  deleteUser,
  getAllHwpAssignments,
  getAllUsers,
  getHwpAssignmentsForUser,
  getUserByEmail,
  getUserById,
  setHwpAssignmentsForUser,
  updateUser,
} from "./db";
import {
  createJWT,
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
} from "./auth";
import {
  deltaSync,
  fullSync,
  getAktuellePauschalen,
  getAllCachedRecords,
  getMehrkostenById,
  getMehrkostenRecords,
  getMehrkostenStats,
  getServiceRessourcen,
} from "./airtable";
import { getDb } from "./db";
import { teamHwpZuordnungen, teamMitglieder } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import {
  clearCache,
  getAllSettings,
  getCacheStats,
  getCached,
  setCached,
  setSetting,
  SETTINGS_KEYS,
} from "./cache";
import { systemRouter } from "./_core/systemRouter";
import { dashboardRouter } from "./routers/dashboard.router";
import { mehrkostenRouter as mkKlassifizierungRouter } from "./routers/mehrkosten.router";
import { hwpRouter } from "./routers/hwp.router";
import { teamsRouter } from "./routers/teams.router";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

// ─── Middleware: Authenticated-only ─────────────────────────────────────────
const adminProcedure = protectedProcedure;

// ─── Router ──────────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  dashboard: dashboardRouter,
  mkKlassifizierung: mkKlassifizierungRouter,
  hwp: hwpRouter,
  teams: teamsRouter,

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      const { passwordHash: _, ...user } = ctx.user as any;
      return user;
    }),

    login: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.isActive) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-Mail oder Passwort falsch",
          });
        }
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-Mail oder Passwort falsch",
          });
        }
        const token = await createJWT(user.id);
        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: "/",
        });
        await updateUser(user.id, { lastSignedIn: new Date() });
        const { passwordHash: _, ...safeUser } = user;
        return { success: true, user: safeUser, token };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
      });
      return { success: true };
    }),

    /**
    * Öffentliche Registrierung für HWP-Partner.
    * Konto wird inaktiv bis ein interner Nutzer es freischaltet.
     */
    registerHwp: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
        companyName: z.string().min(1),
        airtableAccountId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Diese E-Mail-Adresse ist bereits registriert" });
        }
        const passwordHash = await hashPassword(input.password);
        const user = await createUser({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          companyName: input.companyName,
          airtableAccountId: input.airtableAccountId,
          isActive: false, // Muss vom Admin freigeschaltet werden
        });
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return { success: true, message: "Registrierung erfolgreich. Ihr Konto wird vom Administrator freigeschaltet." };
      }),
  }),

  // ── User Management (Admin) ───────────────────────────────────────────────
  users: router({
    list: adminProcedure.query(async () => {
      const allUsers = await getAllUsers();
      return allUsers.map(({ passwordHash: _, ...u }) => u);
    }),

    create: adminProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(8),
          name: z.string().min(1),
          airtableAccountId: z.string().optional(),
          companyName: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "E-Mail bereits vergeben" });
        }
        const passwordHash = await hashPassword(input.password);
        const user = await createUser({
          email: input.email.toLowerCase(),
          passwordHash,
          name: input.name,
          airtableAccountId: input.airtableAccountId,
          companyName: input.companyName,
          isActive: true,
        });
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
      }),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          email: z.string().email().optional(),
          isActive: z.boolean().optional(),
          airtableAccountId: z.string().optional().nullable(),
          companyName: z.string().optional().nullable(),
          password: z.string().min(8).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, password, ...rest } = input;
        const updateData: Record<string, unknown> = { ...rest };
        if (password) {
          updateData.passwordHash = await hashPassword(password);
        }
        const user = await updateUser(id, updateData as any);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === (ctx.user as any).id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sie können sich nicht selbst löschen" });
        }
        await deleteUser(input.id);
        return { success: true };
      }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const user = await getUserById(input.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
      }),

    // HWP-Zuordnungen für einen Nutzer laden
    getHwpAssignments: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return getHwpAssignmentsForUser(input.userId);
      }),

    // HWP-Zuordnungen für einen Nutzer setzen (ersetzt alle bestehenden)
    setHwpAssignments: adminProcedure
      .input(z.object({
        userId: z.number(),
        assignments: z.array(z.object({
          hwpAccountId: z.string(),
          hwpName: z.string(),
        })),
      }))
      .mutation(async ({ input }) => {
        const result = await setHwpAssignmentsForUser(input.userId, input.assignments);
        return { success: true, count: result.length, assignments: result };
      }),

    // Alle Zuordnungen laden (für Übersicht)
    getAllHwpAssignments: adminProcedure
      .query(async () => {
        return getAllHwpAssignments();
      }),

    // Eigene HWP-Zuordnungen laden (für KAM/TOM)
    myHwpAssignments: protectedProcedure
      .query(async ({ ctx }) => {
        const user = ctx.user as any;
        if (!['kam', 'tom', 'tl'].includes(user.role)) return [];
        return getHwpAssignmentsForUser(user.id);
      }),

    // Airtable-Accounts für Lookup laden (aus DB-Cache der Aufträge-Tabelle)
    listAirtableAccounts: adminProcedure
      .query(async () => {
        // Distinct HWP-Accounts aus der gecachten auftraege-Tabelle extrahieren
        const records = await getAllCachedRecords();
        const seen = new Map<string, string>();
        for (const r of records) {
          const id = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
          const name = String(r.fields["Technician: Account: Account Name"] ?? "").trim();
          if (id && !seen.has(id)) {
            seen.set(id, name);
          }
        }
        // Falls DB-Cache leer, direkt von Airtable laden
        if (seen.size === 0) {
          const url = `https://api.airtable.com/v0/appjRcTYUcy6lmKx2/tbl7Ic2j1ozM0sTjF?pageSize=100&fields[]=Technician%3A+Account%3A+Account+Name&fields[]=Technician%3A+Account%3A+Account+ID`;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
          });
          const data = await resp.json() as { records?: Array<{ fields: Record<string, unknown> }> };
          for (const r of data.records ?? []) {
            const id = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
            const name = String(r.fields["Technician: Account: Account Name"] ?? "").trim();
            if (id && !seen.has(id)) seen.set(id, name);
          }
        }
        return Array.from(seen.entries())
          .map(([accountId, name]) => ({
            id: accountId,
            name,
            accountId,
            accountName: name,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "de"));
      }),
  }),

  // ── Rollen-Berechtigungen entfernt ─────────────────────────────────────────
  permissions: router({}),

  // ── Admin-Einstellungen ───────────────────────────────────────────────────
  settings: router({
    getAll: adminProcedure.query(async () => {
      return getAllSettings();
    }),

    set: adminProcedure
      .input(z.object({ key: z.string().min(1), value: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await setSetting(input.key, input.value, (ctx.user as any).id);
        return { success: true };
      }),

    setMany: adminProcedure
      .input(z.array(z.object({ key: z.string(), value: z.string() })))
      .mutation(async ({ input, ctx }) => {
        const userId = (ctx.user as any).id;
        for (const { key, value } of input) {
          await setSetting(key, value, userId);
        }
        return { success: true, count: input.length };
      }),

    cacheStats: adminProcedure.query(async () => {
      return getCacheStats();
    }),

    clearCache: adminProcedure
      .input(z.object({ pattern: z.string().optional() }))
      .mutation(async ({ input }) => {
        const count = await clearCache(input.pattern);
        return { success: true, deletedEntries: count };
      }),

    forceSync: adminProcedure
      .input(z.object({ deltaOnly: z.boolean().optional().default(false) }))
      .mutation(async ({ input }) => {
        try {
          if (input.deltaOnly) {
            // Delta-Sync: nur geänderte Einträge
            const result = await deltaSync();
            return {
              success: true,
              message: `Delta-Sync abgeschlossen: ${result.updated} geänderte Einträge, ${result.total} gesamt`,
              count: result.total,
              updated: result.updated,
            };
          } else {
            // Vollständiger Sync: alle Seiten laden
            const result = await fullSync();
            return {
              success: true,
              message: `Vollständiger Sync abgeschlossen: ${result.count} Einträge in ${result.pages} Seiten`,
              count: result.count,
              updated: result.count,
            };
          }
        } catch (e) {
          console.error('[forceSync] Fehler:', e);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Sync fehlgeschlagen: ${(e as Error).message}`,
          });
        }
      }),
  }),

  // ── Airtable: Aufträge (ehemals Mehrkosten) ───────────────────────────────
  mehrkosten: router({
    list: protectedProcedure
      .input(
        z.object({
          pageSize: z.number().min(1).max(1000).default(50),
          page: z.number().min(1).default(1),
          sortField: z.string().optional(),
          sortDirection: z.enum(["asc", "desc"]).default("desc"),
          search: z.string().optional(),
          statusFilter: z.string().optional(),          // Einzelner Status (legacy)
          statusFilters: z.array(z.string()).optional(), // Mehrfach-Status
          hwpFilters: z.array(z.string()).optional(),    // Mehrfach-HWP (Account IDs)
          teamFilter: z.number().int().optional(),          // Team-ID Filter
          kwFilter: z.number().optional(),
          yearFilter: z.number().optional(),
          bypassCache: z.boolean().optional().default(false),
        })
      )
      .query(async ({ input, ctx }) => {
        const user = ctx.user as any;
        const accountId = user.role === "hwp" ? (user.airtableAccountId ?? undefined) : undefined;

        // ALLE Daten aus DB-Cache laden (kein Paging-Loop nötig – alles lokal)
        const result = await getMehrkostenRecords({ accountId, bypassCache: input.bypassCache ?? false });
        let allRecords: import("./airtable").MehrkostenRecord[] = result.records;

        // KAM/TOM/TL: Nur Aufträge der zugeordneten HWPs anzeigen (wenn Zuordnungen vorhanden)
        if (['kam', 'tom', 'tl'].includes(user.role)) {
          const assignments = await getHwpAssignmentsForUser(user.id);
          if (assignments.length > 0) {
            const allowedIds = new Set(assignments.map((a) => a.hwpAccountId));
            allRecords = allRecords.filter((r) => {
              const aid = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
              return allowedIds.has(aid);
            });
          }
        }

        // Team-Filter: HWPs des gewählten Teams laden und filtern
        if (input.teamFilter) {
          const db = await getDb();
          if (db) {
            const teamHwps = await db
              .select({ hwpAccountId: teamHwpZuordnungen.hwpAccountId })
              .from(teamHwpZuordnungen)
              .where(eq(teamHwpZuordnungen.teamId, input.teamFilter));
            const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
            allRecords = allRecords.filter((r) => {
              const aid = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
              return teamHwpIds.has(aid);
            });
          }
        }

        // HWP-Filter (explizit vom Client, überschreibt Zuordnungsfilter)
        const hwpFilters = input.hwpFilters ?? [];
        if (hwpFilters.length > 0) {
          const hwpSet = new Set(hwpFilters);
          allRecords = allRecords.filter((r) => {
            const aid = String(r.fields["Technician: Account: Account ID"] ?? "").trim();
            return hwpSet.has(aid);
          });
        }

        // Suche (case-insensitive)
        if (input.search && input.search.trim()) {
          const s = input.search.trim().toLowerCase();
          allRecords = allRecords.filter((r) => {
            const f = r.fields;
            return (
              String(f["Opportunity Name"] ?? "").toLowerCase().includes(s) ||
              String(f["Appointment Number"] ?? "").toLowerCase().includes(s) ||
              String(f["Order Number"] ?? "").toLowerCase().includes(s) ||
              String(f["Technician: Account: Account Name"] ?? "").toLowerCase().includes(s)
            );
          });
        }

        // Mehrfach-Status-Filter (neu) oder Einzel-Status-Filter (legacy)
        const statusFilters = input.statusFilters ?? (input.statusFilter ? [input.statusFilter] : []);
        if (statusFilters.length > 0) {
          const statusSet = new Set(statusFilters);
          allRecords = allRecords.filter(
            (r) => statusSet.has(String(r.fields["Status"] ?? ""))
          );
        }

        // Kalenderwoche-Filter
        if (input.kwFilter && input.yearFilter) {
          const { start, end } = getKWDateRange(input.kwFilter, input.yearFilter);
          const startDate = new Date(start);
          const endDate = new Date(end);
          endDate.setHours(23, 59, 59);
          allRecords = allRecords.filter((r) => {
            const dateStr = r.fields["Target End"] as string | undefined
              || r.fields["Last Scheduled End"] as string | undefined;
            if (!dateStr) return false;
            const d = new Date(dateStr);
            return d >= startDate && d <= endDate;
          });
        }

        // Sortierung
        const sf = input.sortField ?? "Created Date";
        const dir = input.sortDirection === "asc" ? 1 : -1;
        allRecords.sort((a, b) => {
          const av = a.fields[sf] as string | number | undefined;
          const bv = b.fields[sf] as string | number | undefined;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });

        // Clientseitige Pagination
        const total = allRecords.length;
        const pageSize = input.pageSize;
        const page = input.page ?? 1;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const start = (page - 1) * pageSize;
        const records = allRecords.slice(start, start + pageSize);

        return { records, total, page, totalPages, pageSize };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.string(), bypassCache: z.boolean().optional() }))
      .query(async ({ input }) => {
        return getMehrkostenById(input.id, input.bypassCache ?? false);
      }),

    // ─── Klassifizierungsdaten aus [HI] ACH Klassi Overview (mit Cache) ──────
    getKlassifizierung: protectedProcedure
      .input(z.object({ orderNumber: z.string(), bypassCache: z.boolean().optional().default(false) }))
      .query(async ({ input }) => {
        const apiKey = process.env.AIRTABLE_API_KEY;
        if (!apiKey) return null;

        const KLASSI_BASE_ID = "appSZqcdigG1dhdmu";
        const KLASSI_TABLE_ID = "tblWaxS2rkZj1Vt5j";
        const cacheKey = `klassi:overview:${input.orderNumber}`;

        type KlassifizierungData = {
          airtableId: string;
          recordUrl?: string;
          caseLink?: string;
          klassifizierungAbgeschlossen?: boolean;
          status?: string;
          completedDateTime?: string;
          assignedTo?: string;
          mehrkostenabschaetzung?: number;
          bauzeit?: string;
          erbrachteLeistungEstimate?: string;
          zaehlerSchrank?: string;
          aufstellort?: string;
          aufstellortDetails?: string;
          anzahlZaehler?: number;
          tsg?: string;
          sondermaterial?: string;
          zzl?: string;
          tabHinweise?: string;
          anzahlUv?: string;
          hak?: string[];
          hakVerschlossen?: string;
          kabelwegZsHak?: number;
          wichtigeNotizen?: string;
          risikobewertung?: string;
          risikobewertungBau?: string;
          risiko?: string;
          komplex?: boolean;
          okf?: boolean;
          okfBegruendung?: string;
          absprachenGetroffen?: boolean;
          absprachen?: string;
          achGrund?: string[];
          achVerantwortlich?: string;
          uvDetails: Array<{ nr: number; todo?: string; montage?: string; zuleitung?: string }>;
          inflow?: string;
          inflowgrund?: string;
          tbk?: string;
          terminierung?: string;
          caseNumber?: string;
          caseSubject?: string;
          description?: string;
        };

        // Cache prüfen (TTL = globale Sync-Einstellung, mindestens 30 Min)
        if (!input.bypassCache) {
          const cached = await getCached<KlassifizierungData>(cacheKey);
          if (cached) return cached;
        }

        try {
          const url = `https://api.airtable.com/v0/${KLASSI_BASE_ID}/${KLASSI_TABLE_ID}?filterByFormula=${encodeURIComponent(`{Order Number}="${input.orderNumber}"`)}&pageSize=1`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (!res.ok) return null;
          const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }> };
          if (!data.records || data.records.length === 0) return null;

          const r = data.records[0];
          const f = r.fields;

          // Relevante Felder strukturiert zurückgeben
          const result = {
            airtableId: r.id,
            recordUrl: f["Record URL"] as string | undefined,
            caseLink: f["Case Link"] as string | undefined,
            // Klassifizierungsstatus
            klassifizierungAbgeschlossen: f["Klassifizierung abgeschlossen"] as boolean | undefined,
            status: f["Status"] as string | undefined,
            completedDateTime: f["Completed Date/Time"] as string | undefined,
            assignedTo: f["Assigned To"] as string | undefined,
            // Kostenschätzung
            mehrkostenabschaetzung: f["Mehrkostenabschätzung"] as number | undefined,
            bauzeit: f["Bauzeit"] as string | undefined,
            erbrachteLeistungEstimate: f["Erbrachte Leistung Estimate"] as string | undefined,
            // Zählerschrank
            zaehlerSchrank: f["Zählerschrank"] as string | undefined,
            aufstellort: f["Aufstellort"] as string | undefined,
            aufstellortDetails: f["Aufstellort Details"] as string | undefined,
            anzahlZaehler: f["Anzahl Zähler"] as number | undefined,
            // Technische Details
            tsg: f["TSG"] as string | undefined,
            sondermaterial: f["Sondermaterial"] as string | undefined,
            zzl: f["ZZL"] as string | undefined,
            tabHinweise: f["TAB Hinweise"] as string | undefined,
            anzahlUv: f["Anzahl UV"] as string | undefined,
            hak: f["HAK"] as string[] | undefined,
            hakVerschlossen: f["HAK verschlossen?"] as string | undefined,
            kabelwegZsHak: f["Kabelweg ZS => HAK"] as number | undefined,
            wichtigeNotizen: f["Wichtige Notizen"] as string | undefined,
            // Risiko
            risikobewertung: f["Risikobewertung"] as string | undefined,
            risikobewertungBau: f["Risikobewertung Bau"] as string | undefined,
            risiko: f["Risiko"] as string | undefined,
            // Flags
            komplex: f["Komplex"] as boolean | undefined,
            okf: f["OKF"] as boolean | undefined,
            okfBegruendung: f["OKF Begründung"] as string | undefined,
            absprachenGetroffen: f["Absprachen getroffen"] as boolean | undefined,
            absprachen: f["Absprachen"] as string | undefined,
            // ACH
            achGrund: f["ACH Grund"] as string[] | undefined,
            achVerantwortlich: f["ACH Verantwortlich"] as string | undefined,
            // UV-Details (bis zu 5)
            uvDetails: [1, 2, 3, 4, 5].map(i => ({
              nr: i,
              todo: f[`UV${i} ToDo`] as string | undefined,
              montage: f[`UV${i} Montage`] as string | undefined,
              zuleitung: f[`UV${i} Zuleitung [m]`] as string | undefined,
            })).filter(uv => uv.todo || uv.montage || uv.zuleitung),
            // Inflow
            inflow: f["Inflow"] as string | undefined,
            inflowgrund: f["Inflowgrund"] as string | undefined,
            tbk: f["TBK"] as string | undefined,
            terminierung: f["Terminierung"] as string | undefined,
            // Case-Infos
            caseNumber: f["Case Number"] as string | undefined,
            caseSubject: f["Case Subject"] as string | undefined,
            description: f["Description"] as string | undefined,
          };

          // Im Cache speichern (non-blocking)
          setCached(cacheKey, result).catch(() => {});
          return result;
        } catch {
          return null;
        }
      }),

    // ─── Klassi-Status für mehrere Aufträge (Batch, aus Cache) ──────────────
    getKlassifizierungBatch: protectedProcedure
      .input(z.object({ orderNumbers: z.array(z.string()).max(200) }))
      .query(async ({ input }) => {
        // Nur gecachte Daten zurückgeben (kein Airtable-Aufruf für Batch)
        const result: Record<string, { klassifizierungAbgeschlossen?: boolean; status?: string; risikobewertung?: string; komplex?: boolean } | null> = {};
        await Promise.all(
          input.orderNumbers.map(async (orderNumber) => {
            const cacheKey = `klassi:overview:${orderNumber}`;
            const cached = await getCached<{ klassifizierungAbgeschlossen?: boolean; status?: string; risikobewertung?: string; komplex?: boolean }>(cacheKey);
            result[orderNumber] = cached ?? null;
          })
        );
        return result;
      }),

    stats: protectedProcedure
      .input(z.object({ bypassCache: z.boolean().optional() }))
      .query(async ({ input, ctx }) => {
        const user = ctx.user as any;
        const accountId = user.role === "hwp" ? (user.airtableAccountId ?? undefined) : undefined;
        return getMehrkostenStats(accountId, input.bypassCache ?? false);
      }),
  }),

  // ── Airtable: Service-Ressourcen ──────────────────────────────────────────
  serviceRessourcen: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = ctx.user as any;
      if (!["admin", "tom", "kam", "tl"].includes(user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return getServiceRessourcen();
    }),
  }),

  // ── Airtable: Pauschalen (Aktuelle Pauschalen-Tabelle) ───────────────────────────
  pauschalen: router({
    // Alle Pauschalen aus AKTUELLE_PAUSCHALEN-Tabelle laden
    list: protectedProcedure
      .input(z.object({
        sortField: z.string().optional().default("1_uv"),
        sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
        search: z.string().optional(),
        bypassCache: z.boolean().optional().default(false),
      }))
      .query(async ({ input, ctx }) => {
        const user = ctx.user as any;
        if (!["admin", "tom", "kam", "tl"].includes(user.role)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Nur für interne Rollen" });
        }
        const result = await getAktuellePauschalen(input.bypassCache);
        let records = result.records;

        // Suche nach HWP-Name
        if (input.search?.trim()) {
          const s = input.search.trim().toLowerCase();
          records = records.filter((r) =>
            String(r.fields.HWP_Select ?? "").toLowerCase().includes(s)
          );
        }

        // Sortierung
        const sf = input.sortField ?? "1_uv";
        const dir = input.sortDirection === "asc" ? 1 : -1;
        records = [...records].sort((a, b) => {
          const av = a.fields[sf as keyof typeof a.fields] as string | number | undefined;
          const bv = b.fields[sf as keyof typeof b.fields] as string | number | undefined;
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return String(av).localeCompare(String(bv)) * dir;
        });

        return { records, total: records.length };
      }),

  }),

  // ── Wochenplanung (Baustellenvorbereitung) ────────────────────────────────
  wochenplanung: router({
    /**
     * Gibt alle Aufträge eines HWPs für eine bestimmte KW zurück,
     * angereichert mit Klassi-Daten (aus Cache) und MVT-Link.
     */
    getByHwpAndKW: protectedProcedure
      .input(z.object({
        hwpAccountId: z.string(),   // Airtable Account-ID des HWPs
        kw: z.number().int().min(1).max(53),
        year: z.number().int().min(2020).max(2040),
        bypassCache: z.boolean().optional().default(false),
      }))
      .query(async ({ input, ctx }) => {
        const user = ctx.user as any;
        if (!['admin', 'tom', 'kam', 'tl'].includes(user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Keine Berechtigung' });
        }

        // KAM/TOM: Darf nur eigene zugeordneten HWPs abfragen
        if (['kam', 'tom', 'tl'].includes(user.role)) {
          const assignments = await getHwpAssignmentsForUser(user.id);
          if (assignments.length > 0) {
            const allowed = new Set(assignments.map((a) => a.hwpAccountId));
            if (!allowed.has(input.hwpAccountId)) {
              throw new TRPCError({ code: 'FORBIDDEN', message: 'HWP nicht zugeordnet' });
            }
          }
        }

        // Alle gecachten Aufträge laden und nach HWP + KW filtern
        const result = await getMehrkostenRecords({ accountId: input.hwpAccountId, bypassCache: input.bypassCache });
        const { start, end } = getKWDateRange(input.kw, input.year);
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59);

        const filtered = result.records.filter((r) => {
          const dateStr = (r.fields['Target End'] as string | undefined)
            ?? (r.fields['Last Scheduled End'] as string | undefined);
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= startDate && d <= endDate;
        });

        // Aufträge nach Datum sortieren
        filtered.sort((a, b) => {
          const da = new Date((a.fields['Target End'] ?? a.fields['Last Scheduled End'] ?? '') as string);
          const db = new Date((b.fields['Target End'] ?? b.fields['Last Scheduled End'] ?? '') as string);
          return da.getTime() - db.getTime();
        });

        // Für jeden Auftrag: Basis-Felder extrahieren
        const apiKey = process.env.AIRTABLE_API_KEY;
        const KLASSI_BASE_ID = 'appSZqcdigG1dhdmu';
        const KLASSI_TABLE_ID = 'tblWaxS2rkZj1Vt5j';

        type KlassiData = {
          klassifizierungAbgeschlossen?: boolean;
          status?: string;
          risikobewertung?: string;
          komplex?: boolean;
          bauzeit?: string;
          mehrkostenabschaetzung?: number;
          zaehlerSchrank?: string;
          tabHinweise?: string;
          wichtigeNotizen?: string;
          uvDetails?: Array<{ nr: number; todo?: string; montage?: string; zuleitung?: string }>;
          hak?: string[];
          achGrund?: string[];
          absprachen?: string;
          okf?: boolean;
          tbk?: string;
        };

        function parseKlassiFields(kf: Record<string, unknown>): KlassiData {
          return {
            klassifizierungAbgeschlossen: kf['Klassifizierung abgeschlossen'] as boolean | undefined,
            status: kf['Status'] as string | undefined,
            risikobewertung: kf['Risikobewertung'] as string | undefined,
            komplex: kf['Komplex'] as boolean | undefined,
            bauzeit: kf['Bauzeit'] as string | undefined,
            mehrkostenabschaetzung: kf['Mehrkostenabschätzung'] as number | undefined,
            zaehlerSchrank: kf['Zählerschrank'] as string | undefined,
            tabHinweise: kf['TAB Hinweise'] as string | undefined,
            wichtigeNotizen: kf['Wichtige Notizen'] as string | undefined,
            uvDetails: [1,2,3,4,5].map(i => ({
              nr: i,
              todo: kf[`UV${i} ToDo`] as string | undefined,
              montage: kf[`UV${i} Montage`] as string | undefined,
              zuleitung: kf[`UV${i} Zuleitung [m]`] as string | undefined,
            })).filter(uv => uv.todo || uv.montage || uv.zuleitung),
            hak: kf['HAK'] as string[] | undefined,
            achGrund: kf['ACH Grund'] as string[] | undefined,
            absprachen: kf['Absprachen'] as string | undefined,
            okf: kf['OKF'] as boolean | undefined,
            tbk: kf['TBK'] as string | undefined,
          };
        }

        // Basis-Felder für alle Aufträge extrahieren
        const baseItems = filtered.map((r) => {
          const f = r.fields;
          const orderNumber = String(f['Order Number'] ?? '').trim();
          const skill = f['Skill'] as string[] | string | undefined;
          const module = f['Module'] as number | undefined;
          return {
            airtableId: r.id,
            orderNumber,
            appointmentNumber: String(f['Appointment Number'] ?? '').trim(),
            opportunityName: String(f['Opportunity Name'] ?? '').trim(),
            hwpName: String(f['Technician: Account: Account Name'] ?? '').trim(),
            status: String(f['Status'] ?? '').trim(),
            targetEnd: (f['Target End'] ?? f['Last Scheduled End'] ?? '') as string,
            sfLink: f['SF-Link SA'] as string | undefined,
            mvtLink: orderNumber ? `https://fulfilment.craftos.enpal.io/workorders/protocol/${orderNumber}/MVT` : undefined,
            ipaLink: (module && module > 0 && orderNumber) ? `https://buildability.craftos.enpal.tech/pv/${orderNumber}` : undefined,
            skill: Array.isArray(skill) ? skill.join(', ') : (skill ?? ''),
            module: (module ?? 0) as number,
            pauschale: (f['Pauschale'] ?? 0) as number,
          };
        });

        // Klassi: erst aus Cache, dann fehlende als BATCH von Airtable laden
        const klassiMap = new Map<string, KlassiData | null>();
        const uncachedOrderNumbers: string[] = [];

        for (const item of baseItems) {
          if (!item.orderNumber) { klassiMap.set(item.orderNumber, null); continue; }
          const cached: KlassiData | null = await getCached(`klassi:overview:${item.orderNumber}`);
          if (cached) {
            klassiMap.set(item.orderNumber, cached);
          } else {
            klassiMap.set(item.orderNumber, null);
            uncachedOrderNumbers.push(item.orderNumber);
          }
        }

        // Batch-Fetch für alle nicht gecachten Aufträge (max 100 pro Request via OR-Formel)
        if (uncachedOrderNumbers.length > 0 && apiKey) {
          try {
            // Airtable erlaubt max ~100 Zeichen pro Formel – in Chunks von 10 aufteilen
            const CHUNK = 10;
            for (let i = 0; i < uncachedOrderNumbers.length; i += CHUNK) {
              const chunk = uncachedOrderNumbers.slice(i, i + CHUNK);
              const formula = chunk.length === 1
                ? `{Order Number}="${chunk[0]}"`
                : `OR(${chunk.map(n => `{Order Number}="${n}"`).join(',')})` ;
              const url = `https://api.airtable.com/v0/${KLASSI_BASE_ID}/${KLASSI_TABLE_ID}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`;
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 8000);
              try {
                const res = await fetch(url, {
                  headers: { Authorization: `Bearer ${apiKey}` },
                  signal: controller.signal,
                });
                clearTimeout(timer);
                if (res.ok) {
                  const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }> };
                  for (const rec of (data.records ?? [])) {
                    const on = String(rec.fields['Order Number'] ?? '').trim();
                    if (!on) continue;
                    const kd = parseKlassiFields(rec.fields);
                    klassiMap.set(on, kd);
                    setCached(`klassi:overview:${on}`, kd).catch(() => {});
                  }
                }
              } catch { clearTimeout(timer); /* Timeout oder Netzwerkfehler – ignorieren */ }
            }
          } catch { /* ignorieren */ }
        }

        const enriched = baseItems.map((item) => ({
          ...item,
          klassi: klassiMap.get(item.orderNumber) ?? null,
        }));

        return {
          hwpAccountId: input.hwpAccountId,
          hwpName: enriched[0]?.hwpName ?? '',
          kw: input.kw,
          year: input.year,
          kwStart: start,
          kwEnd: end,
          auftraege: enriched,
          total: enriched.length,
        };
      }),

    /**
     * Gibt alle HWPs zurück, die in einer bestimmten KW Aufträge haben.
     * Nützlich für die HWP-Auswahl im Frontend.
     */
    getHwpsForKW: protectedProcedure
      .input(z.object({
        kw: z.number().int().min(1).max(53),
        year: z.number().int().min(2020).max(2040),
      }))
      .query(async ({ input, ctx }) => {
        const user = ctx.user as any;
        if (!['admin', 'tom', 'kam', 'tl'].includes(user.role)) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        const result = await getMehrkostenRecords({ bypassCache: false });
        const { start, end } = getKWDateRange(input.kw, input.year);
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59);

        // Alle HWPs mit Aufträgen in dieser KW sammeln
        const hwpMap = new Map<string, { id: string; name: string; count: number }>();
        for (const r of result.records) {
          const dateStr = (r.fields['Target End'] ?? r.fields['Last Scheduled End'] ?? '') as string;
          if (!dateStr) continue;
          const d = new Date(dateStr);
          if (d < startDate || d > endDate) continue;

          const id = String(r.fields['Technician: Account: Account ID'] ?? '').trim();
          const name = String(r.fields['Technician: Account: Account Name'] ?? '').trim();
          if (!id) continue;

          const existing = hwpMap.get(id);
          if (existing) existing.count++;
          else hwpMap.set(id, { id, name, count: 1 });
        }

        // KAM/TOM: Nur zugeordnete HWPs
        let hwps = Array.from(hwpMap.values());
        if (['kam', 'tom', 'tl'].includes(user.role)) {
          const assignments = await getHwpAssignmentsForUser(user.id);
          if (assignments.length > 0) {
            const allowed = new Set(assignments.map((a) => a.hwpAccountId));
            hwps = hwps.filter((h) => allowed.has(h.id));
          }
        }

        return hwps.sort((a, b) => a.name.localeCompare(b.name));
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ─── Hilfsfunktion: Kalenderwoche → Datum-Range ───────────────────────────────
function getKWDateRange(kw: number, year: number): { start: string; end: string } {
  // ISO-Woche: Montag der KW berechnen
  const jan4 = new Date(year, 0, 4); // 4. Januar ist immer in KW1
  const dayOfWeek = jan4.getDay() || 7; // 1=Mo, 7=So
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));

  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { start: fmt(monday), end: fmt(sunday) };
}
