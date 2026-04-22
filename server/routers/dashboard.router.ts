import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getAllCachedRecords } from "../airtable";
import { getAllSettings, setSetting } from "../cache";
import {
  DEFAULT_WIDGET_CONFIG,
  DASHBOARD_WIDGETS_KEY,
  type WidgetConfig,
} from "../../drizzle/schema";

// ─── Hilfsfunktion: ISO-Woche → Datum-Range ──────────────────────────────────
function getKWDateRange(kw: number, year: number): { start: Date; end: Date } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

// ─── Hilfsfunktion: Datum → ISO-Woche ────────────────────────────────────────
function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const kw =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return { kw, year: d.getFullYear() };
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const dashboardRouter = router({

  // ── Statistiken ─────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(
      z.object({
        period: z.enum(["week", "month", "all"]).optional().default("all"),
        kw: z.number().int().min(1).max(53).optional(),
        year: z.number().int().min(2020).max(2030).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const period = input?.period ?? "all";
      const now = new Date();
      let periodStart: Date | null = null;
      let periodEnd: Date | null = null;

      if (period === "week") {
        const kw = input?.kw ?? getISOWeek(now).kw;
        const year = input?.year ?? getISOWeek(now).year;
        const range = getKWDateRange(kw, year);
        periodStart = range.start;
        periodEnd = range.end;
      } else if (period === "month") {
        const year = input?.year ?? now.getFullYear();
        // month from kw: use current month if not specified
        const month = now.getMonth(); // 0-indexed
        periodStart = new Date(year, month, 1, 0, 0, 0, 0);
        periodEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      }
      const user = ctx.user as any;
      const accountId =
        user.role === "hwp" ? (user.airtableAccountId ?? undefined) : undefined;

      const allRecords = await getAllCachedRecords(accountId);

      // Zeitraum-Filter anwenden
      let records = allRecords;
      if (periodStart && periodEnd) {
        records = allRecords.filter((r) => {
          const dateStr =
            (r.fields["Target End"] as string | undefined) ||
            (r.fields["Last Scheduled End"] as string | undefined);
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= periodStart! && d <= periodEnd!;
        });
      }

      const total = records.length;
      let freigegeben = 0;
      let abgelehnt = 0;
      let ausstehend = 0;
      let completed = 0;
      let canceled = 0;
      let scheduled = 0;
      let inProgress = 0;
      let cannotComplete = 0;
      let gesamtMehrkosten = 0;
      let gesamtPauschale = 0;

      const statusCount: Record<string, number> = {};
      const hwpCount: Record<string, number> = {};

      for (const r of records) {
        const f = r.fields;

        // Freigabe-Status
        const freigabe = f["Status - Freigabe"] as string | undefined;
        if (freigabe === "Freigegeben" || freigabe === "Approved") freigegeben++;
        else if (freigabe === "Abgelehnt" || freigabe === "Rejected") abgelehnt++;
        else ausstehend++;

        // Appointment-Status
        const status = f["Status"] as string | undefined;
        if (status) {
          statusCount[status] = (statusCount[status] ?? 0) + 1;
          if (status === "Completed") completed++;
          else if (status === "Canceled") canceled++;
          else if (status === "Scheduled") scheduled++;
          else if (status === "In Progress") inProgress++;
          else if (status === "Cannot Complete") cannotComplete++;
        }

        // Finanzen
        const mk = parseFloat(String(f["Mehrkosten"] ?? "0")) || 0;
        const pa = parseFloat(String(f["Pauschale"] ?? "0")) || 0;
        gesamtMehrkosten += mk;
        gesamtPauschale += pa;

        // HWP-Zählung
        const hwp = f["Technician: Account: Account Name"] as string | undefined;
        if (hwp) hwpCount[hwp] = (hwpCount[hwp] ?? 0) + 1;
      }

      // Alle HWP sortiert nach Auftragsanzahl (für Widget)
      const allHwp = Object.entries(hwpCount)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));

      // Top-5 HWP
      const topHwp = allHwp.slice(0, 5);

      // Status-Verteilung für Chart
      const statusDistribution = Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({ status, count }));

      return {
        period,
        periodStart: periodStart?.toISOString() ?? null,
        periodEnd: periodEnd?.toISOString() ?? null,
        total,
        freigegeben,
        abgelehnt,
        ausstehend,
        completed,
        canceled,
        scheduled,
        inProgress,
        cannotComplete,
        gesamtMehrkosten,
        gesamtPauschale,
        topHwp,
        allHwp,
        statusDistribution,
      };
    }),

  // ── Wochenansicht ───────────────────────────────────────────────────────────
  weeklyOrders: protectedProcedure
    .input(
      z.object({
        kw: z.number().int().min(1).max(53),
        year: z.number().int().min(2020).max(2030),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const accountId =
        user.role === "hwp" ? (user.airtableAccountId ?? undefined) : undefined;

      const allRecords = await getAllCachedRecords(accountId);
      const { start, end } = getKWDateRange(input.kw, input.year);

      let records = allRecords.filter((r) => {
        const dateStr =
          (r.fields["Target End"] as string | undefined) ||
          (r.fields["Last Scheduled End"] as string | undefined);
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return d >= start && d <= end;
      });

      // Sortierung: Target End aufsteigend
      records.sort((a, b) => {
        const ad = new Date(
          (a.fields["Target End"] as string) ||
          (a.fields["Last Scheduled End"] as string) || ""
        ).getTime();
        const bd = new Date(
          (b.fields["Target End"] as string) ||
          (b.fields["Last Scheduled End"] as string) || ""
        ).getTime();
        return ad - bd;
      });

      // Tagesgruppierung Mo–So
      const days: Record<string, typeof records> = {};
      const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = d.toISOString().split("T")[0];
        days[key] = [];
      }
      for (const r of records) {
        const dateStr =
          (r.fields["Target End"] as string | undefined) ||
          (r.fields["Last Scheduled End"] as string | undefined) || "";
        const key = dateStr.split("T")[0];
        if (days[key]) days[key].push(r);
      }

      const grouped = Object.entries(days).map(([date, recs], idx) => ({
        date,
        dayName: dayNames[idx],
        count: recs.length,
        records: recs,
      }));

      return {
        kw: input.kw,
        year: input.year,
        total: records.length,
        records,
        grouped,
        weekStart: start.toISOString().split("T")[0],
        weekEnd: end.toISOString().split("T")[0],
      };
    }),

  // ── Schnellsuche ────────────────────────────────────────────────────────────
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(20).optional().default(8),
      })
    )
    .query(async ({ ctx, input }) => {
      const user = ctx.user as any;
      const accountId =
        user.role === "hwp" ? (user.airtableAccountId ?? undefined) : undefined;

      const allRecords = await getAllCachedRecords(accountId);
      const q = input.query.trim().toLowerCase();

      let records = allRecords;

      const results = records
        .filter((r) => {
          const f = r.fields;
          return (
            String(f["Opportunity Name"] ?? "").toLowerCase().includes(q) ||
            String(f["Order Number"] ?? "").toLowerCase().includes(q) ||
            String(f["Appointment Number"] ?? "").toLowerCase().includes(q) ||
            String(f["Technician: Account: Account Name"] ?? "").toLowerCase().includes(q)
          );
        })
        .slice(0, input.limit)
        .map((r) => ({
          id: r.id,
          opportunityName: r.fields["Opportunity Name"] as string | undefined,
          orderNumber: r.fields["Order Number"] as string | undefined,
          appointmentNumber: r.fields["Appointment Number"] as string | undefined,
          hwpName: r.fields["Technician: Account: Account Name"] as string | undefined,
          status: r.fields["Status"] as string | undefined,
          targetEnd: r.fields["Target End"] as string | undefined,
        }));

      return { results };
    }),

  // ── Widget-Konfiguration lesen ───────────────────────────────────────────────
  getWidgetConfig: protectedProcedure.query(async () => {
    const settings = await getAllSettings();
    const raw = settings[DASHBOARD_WIDGETS_KEY];
    if (!raw) return DEFAULT_WIDGET_CONFIG;
    try {
      const parsed = JSON.parse(raw) as WidgetConfig[];
      // Merge: neue Widgets aus DEFAULT hinzufügen falls noch nicht vorhanden
      const existingIds = new Set(parsed.map((w) => w.id));
      const merged = [...parsed];
      for (const def of DEFAULT_WIDGET_CONFIG) {
        if (!existingIds.has(def.id)) merged.push(def);
      }
      return merged.sort((a, b) => a.order - b.order);
    } catch {
      return DEFAULT_WIDGET_CONFIG;
    }
  }),

  // ── Widget-Konfiguration speichern (Admin only) ──────────────────────────────
  saveWidgetConfig: adminProcedure
    .input(
      z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          enabled: z.boolean(),
          order: z.number(),
        })
      )
    )
    .mutation(async ({ input }) => {
      await setSetting(DASHBOARD_WIDGETS_KEY, JSON.stringify(input));
      return { success: true };
    }),
});
