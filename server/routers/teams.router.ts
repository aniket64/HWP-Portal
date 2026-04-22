/**
 * Teams-Router
 * Verwaltet Teams (KAM + TOM + HWP-Zuordnungen).
 *
 * Berechtigungen:
 * - Admin: Vollzugriff (CRUD, Mitglieder, HWP-Zuordnungen)
 * - KAM/TOM/TL: Lesezugriff auf Teams, denen sie angehören
 * - HWP: kein Zugriff
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router, protectedProcedure } from "../_core/trpc";
import { getDb, getAllTeams, getTeamById, createTeam, updateTeam, deleteTeam, getTeamMitgliederWithUsers, setTeamMitglieder, getTeamHwpZuordnungen, setTeamHwpZuordnungen, getAllUsers, getTeamIdsForUser } from "../db";
import {
  teams,
  teamMitglieder,
  teamHwpZuordnungen,
  Team,
  TeamMitglied,
  TeamHwpZuordnung,
} from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Hilfsfunktion: Team mit Mitgliedern und HWPs anreichern ─────────────────
async function enrichTeam(team: Team) {
  if (!team) return null;

  const [mitglieder, hwpZuordnungen] = await Promise.all([
    getTeamMitgliederWithUsers(team.id),
    getTeamHwpZuordnungen(team.id),
  ]);

  return {
    ...team,
    mitglieder: mitglieder || [],
    hwpZuordnungen: hwpZuordnungen || [],
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const teamsRouter = router({

  /**
   * Alle Teams auflisten
   * - Admin: alle Teams
   * - KAM/TOM/TL: nur Teams, in denen sie Mitglied sind
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user as { id: number; role: string };

    if (user.role === "admin") {
      // Admin sieht alle Teams
      const allTeams = await getAllTeams();
      const enriched = await Promise.all(allTeams.map(t => enrichTeam(t)));
      return enriched.filter(Boolean);
    } else if (["kam", "tom", "tl"].includes(user.role)) {
      // KAM/TOM/TL sehen nur ihre Teams
      const teamIds = await getTeamIdsForUser(user.id);
      if (teamIds.length === 0) return [];

      const allTeams = await getAllTeams();
      const myTeams = allTeams.filter(t => teamIds.includes(t.id));
      const enriched = await Promise.all(myTeams.map(t => enrichTeam(t)));
      return enriched.filter(Boolean);
    } else {
      return [];
    }
  }),

  /**
   * Einzelnes Team laden
   */
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const user = ctx.user as { id: number; role: string };
      const team = await getTeamById(input.id);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team nicht gefunden" });

      // Zugriffsprüfung für Nicht-Admins
      if (user.role !== "admin") {
        const teamIds = await getTeamIdsForUser(user.id);
        if (!teamIds.includes(input.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf dieses Team" });
        }
      }

      return enrichTeam(team);
    }),

  /**
   * Neues Team anlegen (nur Admin)
   */
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1, "Name ist erforderlich").max(255),
      beschreibung: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user as { id: number };

      // Duplikat-Check
      const existing = await getAllTeams();
      if (existing.find(t => t.name === input.name)) {
        throw new TRPCError({ code: "CONFLICT", message: `Ein Team mit dem Namen "${input.name}" existiert bereits` });
      }

      const newTeam = await createTeam({
        name: input.name,
        beschreibung: input.beschreibung ?? null,
        createdBy: user.id,
      });

      if (!newTeam) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Team konnte nicht erstellt werden" });
      return enrichTeam(newTeam);
    }),

  /**
   * Team bearbeiten (nur Admin)
   */
  update: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(255),
      beschreibung: z.string().max(1000).optional().nullable(),
    }))
    .mutation(async ({ input }) => {
      const existing = await getTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team nicht gefunden" });

      // Duplikat-Check (anderes Team mit gleichem Namen)
      const allTeams = await getAllTeams();
      const duplicate = allTeams.find(t => t.name === input.name && t.id !== input.id);
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: `Ein Team mit dem Namen "${input.name}" existiert bereits` });
      }

      const updated = await updateTeam(input.id, {
        name: input.name,
        beschreibung: input.beschreibung ?? null,
      });

      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Team konnte nicht aktualisiert werden" });
      return enrichTeam(updated);
    }),

  /**
   * Team löschen (nur Admin)
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const existing = await getTeamById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team nicht gefunden" });

      await deleteTeam(input.id);
      return { success: true };
    }),

  /**
   * Mitglieder eines Teams setzen (ersetzt alle vorherigen)
   */
  setMitglieder: adminProcedure
    .input(z.object({
      teamId: z.number().int().positive(),
      mitglieder: z.array(z.object({
        userId: z.number().int().positive(),
        teamRolle: z.enum(["kam", "tom", "tl"]),
      })),
    }))
    .mutation(async ({ input }) => {
      const team = await getTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team nicht gefunden" });

      await setTeamMitglieder(input.teamId, input.mitglieder);
      const updated = await getTeamById(input.teamId);
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Team konnte nicht aktualisiert werden" });
      return enrichTeam(updated);
    }),

  /**
   * HWP-Zuordnungen eines Teams setzen (ersetzt alle vorherigen)
   * Nur Admin
   */
  setHwpZuordnungen: adminProcedure
    .input(z.object({
      teamId: z.number().int().positive(),
      hwps: z.array(z.object({
        hwpAccountId: z.string().min(1),
        hwpName: z.string().min(1),
      })),
    }))
    .mutation(async ({ input }) => {
      const team = await getTeamById(input.teamId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team nicht gefunden" });

      await setTeamHwpZuordnungen(input.teamId, input.hwps);
      const updated = await getTeamById(input.teamId);
      if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Team konnte nicht aktualisiert werden" });
      return enrichTeam(updated);
    }),

  /**
   * Alle verfügbaren Nutzer für die Mitgliederauswahl
   */
  listVerfuegbareMitglieder: adminProcedure.query(async () => {
    const allUsers = await getAllUsers();
    return allUsers.filter(u => ["kam", "tom", "tl"].includes(u.role));
  }),
});
