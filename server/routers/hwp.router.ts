/**
 * HWP-Router
 * Liefert jedem HWP-Nutzer nur seine eigenen Aufträge (gefiltert nach airtableAccountId)
 * und verknüpft diese mit den zugehörigen Mehrkosten-Rechnungen aus der DB.
 *
 * Kernlogik:
 * - Aufträge kommen aus der lokalen DB (auftraege-Tabelle, gecacht von Airtable)
 * - Mehrkosten-Rechnungen kommen aus mk_rechnungen (verknüpft über orderNumber)
 * - Ein Auftrag zeigt Mehrkosten, sobald er in der auftraege-Tabelle erscheint
 *   UND eine mk_rechnung mit gleicher orderNumber existiert
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getMkRechnungenByOrderNumbers, getMkRechnungByOrderNumber, getMkRechnungById, createMkRechnung, updateMkRechnung, getMkPositionenForRechnung, createMkPosition, deleteMkPositionenByQuelle, getMkNachtraegeForRechnung, createMkNachtrag, getLatestMkNachtragForRechnung, updateMkNachtrag } from "../db";
import { getAllCachedRecords } from "../airtable";
import { auftraege, mkRechnungen, mkPositionen, mkNachtraege } from "../../drizzle/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** ISO-Kalenderwoche aus einem Datum berechnen */
function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { kw, year: d.getUTCFullYear() };
}

/** Montag und Sonntag einer ISO-KW berechnen */
function getKWRange(kw: number, year: number): { start: Date; end: Date } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

/** Alle KWs eines Jahres berechnen */
function getMaxKW(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return getISOWeek(dec28).kw;
}

/** KW um n Wochen verschieben */
function shiftKW(kw: number, year: number, delta: number): { kw: number; year: number } {
  const { start } = getKWRange(kw, year);
  start.setDate(start.getDate() + delta * 7);
  return getISOWeek(start);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const hwpRouter = router({

  /**
   * Eigene Aufträge des HWP nach Kalenderwoche
   * Joiniert automatisch mit mk_rechnungen wenn orderNumber übereinstimmt
   */
  meineAuftraege: protectedProcedure
    .input(z.object({
      kw: z.number().int().min(1).max(53).optional(),
      year: z.number().int().min(2020).max(2030).optional(),
      search: z.string().optional(),
      skipKwFilter: z.boolean().optional(), // wenn true: KW-Filter ignorieren (Globalsuche)
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(1000).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const user = ctx.user as { id: number; role: string; airtableAccountId?: string };

      // HWP muss eine airtableAccountId haben
      if (!user.airtableAccountId) {
        return { auftraege: [], total: 0, page: 1, totalPages: 0, kw: 0, year: 0, kwRange: null };
      }

      const db = await getDb();

      // Aktuelle KW bestimmen
      const today = new Date();
      const currentKW = getISOWeek(today);
      const effectiveKW = input.kw ?? currentKW.kw;
      const effectiveYear = input.year ?? currentKW.year;
      const kwRange = getKWRange(effectiveKW, effectiveYear);

      // Alle Aufträge dieses HWP laden
      let rows: Array<{
        airtableId: string;
        opportunityName: string | null;
        appointmentNumber: string | null;
        orderNumber: string | null;
        status: string | null;
        targetEnd: string | null;
        lastScheduledEnd: string | null;
        fieldsJson: string;
      }> = [];

      if (db) {
        rows = await db.select().from(auftraege)
          .where(eq(auftraege.technicianAccountId, user.airtableAccountId));
      } else {
        const records = await getAllCachedRecords(user.airtableAccountId);
        rows = records.map((record) => {
          const f = record.fields as Record<string, unknown>;
          return {
            airtableId: record.id,
            opportunityName: (f["Opportunity Name"] as string) ?? null,
            appointmentNumber: (f["Appointment Number"] as string) ?? null,
            orderNumber: (f["Order Number"] as string) ?? null,
            status: (f["Status"] as string) ?? null,
            targetEnd: (f["Target End"] as string) ?? null,
            lastScheduledEnd: (f["Last Scheduled End"] as string) ?? null,
            fieldsJson: JSON.stringify(f),
          };
        });
      }

      // KW-Filter: nach targetEnd oder lastScheduledEnd (deaktiviert bei Globalsuche)
      if (!input.skipKwFilter) {
        rows = rows.filter(row => {
          const dateStr = row.targetEnd ?? row.lastScheduledEnd;
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= kwRange.start && d <= kwRange.end;
        });
      }

      // Suche
      if (input.search?.trim()) {
        const s = input.search.trim().toLowerCase();
        rows = rows.filter(row => {
          const fields = (() => { try { return JSON.parse(row.fieldsJson); } catch { return {}; } })();
          return (
            String(row.opportunityName ?? "").toLowerCase().includes(s) ||
            String(row.appointmentNumber ?? "").toLowerCase().includes(s) ||
            String(row.orderNumber ?? "").toLowerCase().includes(s)
          );
        });
      }

      // Sortierung: nach targetEnd absteigend
      rows.sort((a, b) => {
        const da = new Date(a.targetEnd ?? a.lastScheduledEnd ?? 0).getTime();
        const db2 = new Date(b.targetEnd ?? b.lastScheduledEnd ?? 0).getTime();
        return db2 - da;
      });

      // Alle orderNumbers sammeln um Rechnungen zu laden
      const orderNumbers = rows
        .map(r => r.orderNumber)
        .filter((n): n is string => !!n);

      // Rechnungen für diese Aufträge laden (JOIN über orderNumber)
      const rechnungen = orderNumbers.length > 0
        ? (await getMkRechnungenByOrderNumbers(orderNumbers)).map(r => ({
            id: r.id,
            orderNumber: r.orderNumber,
            uvAnzahl: r.uvAnzahl,
            pauschaleBetrag: r.pauschaleBetrag,
            summeOhnePauschale: r.summeOhnePauschale,
            summeMitPauschale: r.summeMitPauschale,
            status: r.status,
            hwpName: r.hwpName,
            erstelltVonName: r.erstelltVonName,
            updatedAt: r.updatedAt,
          }))
        : [];

      const rechnungMap = new Map(rechnungen.map(r => [r.orderNumber, r]));

      // Pagination
      const total = rows.length;
      const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
      const start = (input.page - 1) * input.pageSize;
      const paged = rows.slice(start, start + input.pageSize);

      // Aufträge mit Rechnungen anreichern
      const result = paged.map(row => {
        const fields = (() => { try { return JSON.parse(row.fieldsJson); } catch { return {}; } })();
        const rechnung = row.orderNumber ? rechnungMap.get(row.orderNumber) ?? null : null;
        return {
          airtableId: row.airtableId,
          opportunityName: row.opportunityName,
          appointmentNumber: row.appointmentNumber,
          orderNumber: row.orderNumber,
          status: row.status,
          targetEnd: row.targetEnd,
          lastScheduledEnd: row.lastScheduledEnd,
          // Aus fieldsJson
          statusFreigabe: fields["Status - Freigabe"] as string | undefined,
          mehrkosten: fields["Mehrkosten"] as number | undefined,
          pauschale: fields["Pauschale"] as number | undefined,
          // Verknüpfte Mehrkosten-Rechnung (nur wenn terminiert + Rechnung vorhanden)
          rechnung,
        };
      });

      return {
        auftraege: result,
        total,
        page: input.page,
        totalPages,
        kw: effectiveKW,
        year: effectiveYear,
        kwRange: {
          start: kwRange.start.toISOString(),
          end: kwRange.end.toISOString(),
          label: `${kwRange.start.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${kwRange.end.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
        },
      };
    }),

  /**
   * Verfügbare KWs für diesen HWP (welche KWs haben Aufträge?)
   */
  verfuegbareKWs: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as { id: number; role: string; airtableAccountId?: string };
      if (!user.airtableAccountId) return [];

      const db = await getDb();
      const rows = db
        ? await db.select({
            targetEnd: auftraege.targetEnd,
            lastScheduledEnd: auftraege.lastScheduledEnd,
          }).from(auftraege)
          .where(eq(auftraege.technicianAccountId, user.airtableAccountId))
        : (await getAllCachedRecords(user.airtableAccountId)).map((record) => {
            const f = record.fields as Record<string, unknown>;
            return {
              targetEnd: (f["Target End"] as string) ?? null,
              lastScheduledEnd: (f["Last Scheduled End"] as string) ?? null,
            };
          });

      // KWs aus Datumsfeldern extrahieren
      const kwSet = new Map<string, { kw: number; year: number; count: number }>();
      for (const row of rows) {
        const dateStr = row.targetEnd ?? row.lastScheduledEnd;
        if (!dateStr) continue;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;
        const { kw, year } = getISOWeek(d);
        const key = `${year}-${kw}`;
        const existing = kwSet.get(key);
        if (existing) {
          existing.count++;
        } else {
          kwSet.set(key, { kw, year, count: 1 });
        }
      }

      // Sortiert nach Jahr und KW absteigend
      return Array.from(kwSet.values())
        .sort((a, b) => b.year !== a.year ? b.year - a.year : b.kw - a.kw);
    }),

  /**
   * Detail eines einzelnen Auftrags mit vollständiger Mehrkosten-Rechnung
   */
  auftragDetail: protectedProcedure
    .input(z.object({ airtableId: z.string() }))
    .query(async ({ input, ctx }) => {
      const user = ctx.user as { id: number; role: string; airtableAccountId?: string };

      const db = await getDb();
      // Auftrag laden
      const row = db
        ? (await db.select().from(auftraege)
            .where(eq(auftraege.airtableId, input.airtableId))
            .limit(1))[0]
        : (() => {
            const load = async () => {
              const records = await getAllCachedRecords();
              const record = records.find((r) => r.id === input.airtableId);
              if (!record) return undefined;
              const f = record.fields as Record<string, unknown>;
              return {
                airtableId: record.id,
                opportunityName: (f["Opportunity Name"] as string) ?? null,
                appointmentNumber: (f["Appointment Number"] as string) ?? null,
                orderNumber: (f["Order Number"] as string) ?? null,
                status: (f["Status"] as string) ?? null,
                targetEnd: (f["Target End"] as string) ?? null,
                lastScheduledEnd: (f["Last Scheduled End"] as string) ?? null,
                technicianAccountId: (f["Technician: Account: Account ID"] as string) ?? null,
                fieldsJson: JSON.stringify(f),
              } as any;
            };
            return load();
          })();

      const resolvedRow = row instanceof Promise ? await row : row;

      if (!resolvedRow) throw new TRPCError({ code: "NOT_FOUND", message: "Auftrag nicht gefunden" });

      // HWP darf nur eigene Aufträge sehen
      if (user.role === "hwp" && resolvedRow.technicianAccountId !== user.airtableAccountId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diesen Auftrag" });
      }

      const fields = (() => { try { return JSON.parse(resolvedRow.fieldsJson); } catch { return {}; } })();

      // Mehrkosten-Rechnung laden (über orderNumber)
      let rechnungData: {
        rechnung: typeof mkRechnungen.$inferSelect;
        positionen: (typeof mkPositionen.$inferSelect)[];
        nachtraege: (typeof mkNachtraege.$inferSelect)[];
      } | null = null;

      if (resolvedRow.orderNumber) {
        const rechnung = await getMkRechnungByOrderNumber(resolvedRow.orderNumber);

        if (rechnung) {
          const positionen = await getMkPositionenForRechnung(rechnung.id);
          const nachtraege = await getMkNachtraegeForRechnung(rechnung.id);

          rechnungData = { rechnung, positionen, nachtraege };
        }
      }

      return {
        airtableId: resolvedRow.airtableId,
        opportunityName: resolvedRow.opportunityName,
        appointmentNumber: resolvedRow.appointmentNumber,
        orderNumber: resolvedRow.orderNumber,
        status: resolvedRow.status,
        targetEnd: resolvedRow.targetEnd,
        lastScheduledEnd: resolvedRow.lastScheduledEnd,
        fields,
        rechnung: rechnungData,
      };
    }),

  /**
   * Pauschale für einen HWP und eine UV-Anzahl berechnen.
   * Liest aus Cache; bei leerem Cache wird Airtable direkt abgefragt und der Cache befüllt.
   */
  getPauschaleForHwp: protectedProcedure
    .input(z.object({
      hwpName: z.string(),          // Fallback: Namens-Matching
      hwpAccountId: z.string().optional(), // Primär: Account-ID-Matching (zuverlässig)
      uvAnzahl: z.number().int().min(1).max(10),
    }))
    .query(async ({ input }) => {
      const { getCached, setCached } = await import("../cache");
      // Separater Cache-Key der Account-ID enthält (damit kein Konflikt mit altem Cache)
      const cacheKey = "klassi:hwp_pauschalen_v2";
      type PauschaleRow = {
        id: string;
        hwpName: string;
        hwpAccountId: string;
        uv1: number; uv2: number; uv3: number; uv4: number;
        endDate: string;
      };

      let rows = await getCached<PauschaleRow[]>(cacheKey);

      // Cache leer → direkt aus Airtable laden und cachen
      if (!rows) {
        const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";
        const MK_BASE_ID = "appjRcTYUcy6lmKx2";
        const HWP_PAUSCHALEN_TABLE = "tblAWJS4XKLrv4Pd1";
        const key = process.env.AIRTABLE_API_KEY;
        if (key) {
          const allRecords: Array<{ id: string; fields: Record<string, unknown> }> = [];
          let offset: string | undefined;
          do {
            let path = `${AIRTABLE_BASE_URL}/${MK_BASE_ID}/${HWP_PAUSCHALEN_TABLE}?pageSize=100`;
            if (offset) path += `&offset=${encodeURIComponent(offset)}`;
            const res = await fetch(path, { headers: { Authorization: `Bearer ${key}` } });
            if (res.ok) {
              const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string };
              allRecords.push(...(data.records || []));
              offset = data.offset;
            } else {
              break;
            }
          } while (offset);

          // Neuesten Eintrag pro HWP nach end_date wählen (Schlüssel: Account-ID)
          // Account-ID ist zuverlässiger als HWP-Name (Name kann abweichen)
          const latestPerAccountId = new Map<string, { id: string; fields: Record<string, unknown> }>();
          for (const r of allRecords) {
            const name = String(r.fields["HWP_Select"] ?? "").trim();
            if (!name) continue;
            // account_id (from HWP_Select) ist ein Lookup-Feld – kann Array oder String sein
            const rawAccountId = r.fields["account_id (from HWP_Select)"];
            const accountId = Array.isArray(rawAccountId)
              ? String(rawAccountId[0] ?? "").trim()
              : String(rawAccountId ?? "").trim();
            // Als Schlüssel Account-ID verwenden (falls vorhanden), sonst Name
            const key2 = accountId || name;
            const prev = latestPerAccountId.get(key2);
            const endDate = String(r.fields["end_date"] ?? "");
            const prevEndDate = prev ? String(prev.fields["end_date"] ?? "") : "";
            if (!prev || endDate > prevEndDate) latestPerAccountId.set(key2, r);
          }
          rows = Array.from(latestPerAccountId.entries()).map(([key2, r]) => {
            const rawAccountId = r.fields["account_id (from HWP_Select)"];
            const accountId = Array.isArray(rawAccountId)
              ? String(rawAccountId[0] ?? "").trim()
              : String(rawAccountId ?? "").trim();
            return {
              id: r.id,
              hwpName: String(r.fields["HWP_Select"] ?? "").trim(),
              hwpAccountId: accountId,
              uv1: Number(r.fields["1_uv"] ?? 0),
              uv2: Number(r.fields["2_uv"] ?? 0),
              uv3: Number(r.fields["3_uv"] ?? 0),
              uv4: Number(r.fields["4_uv"] ?? 0),
              endDate: String(r.fields["end_date"] ?? ""),
            };
          });
          await setCached(cacheKey, rows).catch(() => {}); // Cache befüllen
        }
      }

      if (rows) {
        // 1. Primär: Account-ID-Matching (zuverlässig, unabhängig von Schreibweise)
        let match = input.hwpAccountId
          ? rows.find(r => r.hwpAccountId === input.hwpAccountId)
          : undefined;
        // 2. Fallback: Exakter Namens-Vergleich
        if (!match) {
          match = rows.find(r => r.hwpName.toLowerCase() === input.hwpName.toLowerCase());
        }
        // 3. Fallback: Enthält-Suche (z.B. "Rabofsky" findet "Karl Rabofsky GmbH")
        if (!match) {
          const needle = input.hwpName.toLowerCase();
          match = rows.find(r =>
            r.hwpName.toLowerCase().includes(needle) ||
            needle.includes(r.hwpName.toLowerCase())
          );
        }
        if (match) {
          const uv = Math.min(input.uvAnzahl, 4) as 1 | 2 | 3 | 4;
          const betrag = match[`uv${uv}`] as number ?? 0;
          return { betrag: Math.round(betrag), hwpFullName: match.hwpName };
        }
      }
      return { betrag: 0, hwpFullName: null };
    }),

  /**
   * HWP erstellt selbstständig einen Mehrkosten-Antrag für einen Auftrag.
   * Legt mkRechnung + mkNachtrag in einem Schritt an.
   */
  createMkAntrag: protectedProcedure
    .input(z.object({
      airtableId: z.string(),
      orderNumber: z.string(),
      kundenName: z.string(),
      uvAnzahl: z.number().int().min(1).max(10),
      pauschaleBetrag: z.number().int().min(0),
      positionen: z.array(z.object({
        positionKey: z.string(),
        menge: z.number().int().min(0),
        isFreitext: z.boolean().optional().default(false),
        freitextBezeichnung: z.string().max(255).optional(),
        freitextEinzelpreis: z.number().int().min(0).optional(),
      })),
      kommentar: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user as { id: number; role: string; name: string; airtableAccountId?: string; companyName?: string };
      if (user.role !== "hwp") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Nur Handwerkspartner können Anträge einreichen" });
      }
      if (!user.airtableAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Airtable-Konto verknüpft. Bitte Admin kontaktieren." });
      }
      const db = await getDb();

      // Sicherstellen dass der Auftrag diesem HWP gehört
      const row = db
        ? (await db.select().from(auftraege)
            .where(eq(auftraege.airtableId, input.airtableId))
            .limit(1))[0]
        : (() => {
            const load = async () => {
              const records = await getAllCachedRecords();
              const record = records.find((r) => r.id === input.airtableId);
              if (!record) return undefined;
              const f = record.fields as Record<string, unknown>;
              return {
                airtableId: record.id,
                technicianAccountId: (f["Technician: Account: Account ID"] as string) ?? null,
              } as any;
            };
            return load();
          })();
      const resolvedRow = row instanceof Promise ? await row : row;
      if (!resolvedRow) throw new TRPCError({ code: "NOT_FOUND", message: "Auftrag nicht gefunden" });
      if (resolvedRow.technicianAccountId !== user.airtableAccountId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diesen Auftrag" });
      }

      // Prüfen ob bereits eine Rechnung existiert
      const existing = await getMkRechnungByOrderNumber(input.orderNumber);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Für diesen Auftrag existiert bereits ein Mehrkosten-Antrag" });
      }

      // Positionen berechnen
      const { berechnePauschaleAbzug, MK_KATALOG } = await import("../../shared/mk-positionen-katalog");
      const pauschaleAbzug = berechnePauschaleAbzug(input.uvAnzahl);
      let summeOhnePauschale = 0;
      let pauschaleSumme = 0;
      const positionenMitPreisen = input.positionen
        .filter(p => p.menge > 0)
        .map(p => {
          if (p.isFreitext) {
            const ep = p.freitextEinzelpreis ?? 0;
            const gesamt = p.menge * ep;
            summeOhnePauschale += gesamt;
            return {
              positionKey: p.positionKey,
              positionLabel: p.freitextBezeichnung ?? p.positionKey,
              einheit: "Menge",
              einzelpreis: ep,
              menge: p.menge,
              inPauschaleEnthalten: false,
              pauschaleMenge: 0,
              nettomenge: p.menge,
              gesamtpreis: gesamt,
              quelle: "nachtrag" as const,
              isFreitext: true,
            };
          }
          const katalogPos = MK_KATALOG.find(k => k.key === p.positionKey);
          if (!katalogPos) return null;
          const pauschaleMenge = Math.min(p.menge, pauschaleAbzug.get(p.positionKey) ?? 0);
          const nettomenge = p.menge - pauschaleMenge;
          summeOhnePauschale += p.menge * katalogPos.einzelpreisEuro;
          pauschaleSumme += pauschaleMenge * katalogPos.einzelpreisEuro;
          return {
            positionKey: p.positionKey,
            positionLabel: katalogPos.label,
            einheit: katalogPos.einheit,
            einzelpreis: katalogPos.einzelpreisEuro,
            menge: p.menge,
            inPauschaleEnthalten: pauschaleMenge > 0,
            pauschaleMenge,
            nettomenge,
            gesamtpreis: nettomenge * katalogPos.einzelpreisEuro,
            quelle: "nachtrag" as const,
            isFreitext: false,
          };
        })
        .filter(Boolean) as Array<{
          positionKey: string; positionLabel: string; einheit: string;
          einzelpreis: number; menge: number; inPauschaleEnthalten: boolean;
          pauschaleMenge: number; nettomenge: number; gesamtpreis: number;
          quelle: "nachtrag"; isFreitext: boolean;
        }>;

      const summeMitPauschale = summeOhnePauschale - pauschaleSumme + input.pauschaleBetrag;

      // Rechnung anlegen (Status: nachtrag, da HWP direkt einreicht)
      const rechnung = await createMkRechnung({
        orderNumber: input.orderNumber,
        airtableAppointmentsId: input.airtableId,
        kundenName: input.kundenName,
        hwpName: user.companyName ?? user.name,
        hwpAccountId: user.airtableAccountId,
        uvAnzahl: input.uvAnzahl,
        pauschaleBetrag: input.pauschaleBetrag,
        summeOhnePauschale,
        summeMitPauschale,
        status: "nachtrag",
        erstelltVon: user.id,
        erstelltVonName: user.name,
      });
      const rechnungId = rechnung.id;

      // Positionen einfügen
      if (positionenMitPreisen.length > 0) {
        for (const p of positionenMitPreisen) {
          await createMkPosition({ ...p, rechnungId });
        }
      }

      // Nachtrag anlegen
      const nachtrag = await createMkNachtrag({
        rechnungId,
        eingereichtVon: user.id,
        eingereichtVonName: user.name,
        summeOhnePauschale,
        summeMitPauschale,
        hwpKommentar: input.kommentar,
        status: "offen",
      });
      const nachtragId = nachtrag.id;

      return { rechnungId, nachtragId, summeOhnePauschale, summeMitPauschale };
    }),

  /**
   * Bestehenden MK-Antrag bearbeiten (nur wenn Nachtrag-Status = "offen")
   * HWP kann Positionen, UV-Anzahl und Kommentar ändern.
   */
  updateMkAntrag: protectedProcedure
    .input(z.object({
      rechnungId: z.number(),
      uvAnzahl: z.number().min(1),
      pauschaleBetrag: z.number().min(0),
      positionen: z.array(z.object({
        positionKey: z.string(),
        menge: z.number().min(0),
        isFreitext: z.boolean().optional().default(false),
        freitextBezeichnung: z.string().optional(),
        freitextEinzelpreis: z.number().optional(),
      })),
      kommentar: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as { id: number; role: string; airtableAccountId?: string };
      // Rechnung laden
      const rechnung = await getMkRechnungById(input.rechnungId);
      if (!rechnung) throw new TRPCError({ code: "NOT_FOUND", message: "Antrag nicht gefunden" });
      // Nur HWP-eigene Anträge
      if (user.role === "hwp" && user.airtableAccountId && rechnung.hwpAccountId !== user.airtableAccountId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Kein Zugriff auf diesen Antrag" });
      }
      // Nachtrag laden und Status prüfen
      const nachtrag = await getLatestMkNachtragForRechnung(input.rechnungId);
      if (!nachtrag || nachtrag.status !== "offen") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dieser Antrag kann nicht mehr bearbeitet werden (Status: " + (nachtrag?.status ?? "unbekannt") + ")" });
      }
      // Positionen neu berechnen
      const { berechnePauschaleAbzug, MK_KATALOG } = await import("../../shared/mk-positionen-katalog");
      const pauschaleAbzug = berechnePauschaleAbzug(input.uvAnzahl);
      let summeOhnePauschale = 0;
      let pauschaleSumme = 0;
      const positionenMitPreisen = input.positionen
        .filter(p => p.menge > 0)
        .map(p => {
          if (p.isFreitext) {
            const ep = p.freitextEinzelpreis ?? 0;
            const gesamt = p.menge * ep;
            summeOhnePauschale += gesamt;
            return {
              positionKey: p.positionKey,
              positionLabel: p.freitextBezeichnung ?? p.positionKey,
              einheit: "Menge",
              einzelpreis: ep,
              menge: p.menge,
              inPauschaleEnthalten: false,
              pauschaleMenge: 0,
              nettomenge: p.menge,
              gesamtpreis: gesamt,
              quelle: "nachtrag" as const,
              isFreitext: true,
            };
          }
          const katalogPos = MK_KATALOG.find(k => k.key === p.positionKey);
          if (!katalogPos) return null;
          const pauschaleMenge = Math.min(p.menge, pauschaleAbzug.get(p.positionKey) ?? 0);
          const nettomenge = p.menge - pauschaleMenge;
          summeOhnePauschale += p.menge * katalogPos.einzelpreisEuro;
          pauschaleSumme += pauschaleMenge * katalogPos.einzelpreisEuro;
          return {
            positionKey: p.positionKey,
            positionLabel: katalogPos.label,
            einheit: katalogPos.einheit,
            einzelpreis: katalogPos.einzelpreisEuro,
            menge: p.menge,
            inPauschaleEnthalten: pauschaleMenge > 0,
            pauschaleMenge,
            nettomenge,
            gesamtpreis: nettomenge * katalogPos.einzelpreisEuro,
            quelle: "nachtrag" as const,
            isFreitext: false,
          };
        })
        .filter(Boolean) as Array<{
          positionKey: string; positionLabel: string; einheit: string;
          einzelpreis: number; menge: number; inPauschaleEnthalten: boolean;
          pauschaleMenge: number; nettomenge: number; gesamtpreis: number;
          quelle: "nachtrag"; isFreitext: boolean;
        }>;
      const summeMitPauschale = summeOhnePauschale - pauschaleSumme + input.pauschaleBetrag;
      // Positionen ersetzen
      await deleteMkPositionenByQuelle(input.rechnungId, "nachtrag");
      if (positionenMitPreisen.length > 0) {
        for (const p of positionenMitPreisen) {
          await createMkPosition({ ...p, rechnungId: input.rechnungId });
        }
      }
      // Rechnung aktualisieren
      await updateMkRechnung(input.rechnungId, {
        uvAnzahl: input.uvAnzahl,
        pauschaleBetrag: input.pauschaleBetrag,
        summeOhnePauschale,
        summeMitPauschale,
        updatedAt: new Date(),
      });
      // Nachtrag aktualisieren
      await updateMkNachtrag(nachtrag.id, {
        summeOhnePauschale,
        summeMitPauschale,
        hwpKommentar: input.kommentar,
      });
      return { success: true, summeOhnePauschale, summeMitPauschale };
    }),

  /**
   * KPI-Zusammenfassung für den HWP (Anzahl Aufträge, Mehrkosten-Summe)
   */
  meineStats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user as { id: number; role: string; airtableAccountId?: string };
      if (!user.airtableAccountId) {
        return { totalAuftraege: 0, auftraegeThisMonth: 0, totalMehrkosten: 0, offeneNachtraege: 0 };
      }

      const db = await getDb();

      // Alle Aufträge dieses HWP
      const alleAuftraege = db
        ? await db.select({
            orderNumber: auftraege.orderNumber,
            targetEnd: auftraege.targetEnd,
          }).from(auftraege)
          .where(eq(auftraege.technicianAccountId, user.airtableAccountId))
        : (await getAllCachedRecords(user.airtableAccountId)).map((record) => {
            const f = record.fields as Record<string, unknown>;
            return {
              orderNumber: (f["Order Number"] as string) ?? null,
              targetEnd: (f["Target End"] as string) ?? null,
            };
          });

      // Aufträge diesen Monat
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const auftraegeThisMonth = alleAuftraege.filter(a => {
        const d = new Date(a.targetEnd ?? "");
        return !isNaN(d.getTime()) && d >= monthStart;
      }).length;

      // Mehrkosten-Rechnungen für diese Aufträge
      const orderNumbers = alleAuftraege
        .map(a => a.orderNumber)
        .filter((n): n is string => !!n);

      let totalMehrkosten = 0;
      let offeneNachtraege = 0;

      if (orderNumbers.length > 0) {
        const rechnungen = await getMkRechnungenByOrderNumbers(orderNumbers);

        totalMehrkosten = rechnungen.reduce((sum, r) => sum + (r.summeMitPauschale ?? 0), 0);

        // Offene Nachträge
        const rechnungIds = rechnungen.map(r => r.id);
        if (rechnungIds.length > 0) {
          const allNachtraege = await Promise.all(rechnungIds.map((id) => getMkNachtraegeForRechnung(id)));
          offeneNachtraege = allNachtraege
            .flat()
            .filter((n: any) => n.status === "offen").length;
        }
      }

      return {
        totalAuftraege: alleAuftraege.length,
        auftraegeThisMonth,
        totalMehrkosten,
        offeneNachtraege,
      };
    }),
});
