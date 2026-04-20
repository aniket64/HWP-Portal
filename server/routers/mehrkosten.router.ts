/**
 * Mehrkosten-Router
 * Handles:
 * - Klassifizierung: TOM wählt Kunden aus TBK/nTBK, füllt Mehrkostenrechner aus
 * - Nachtrag: HWP reicht Nachtrag ein
 * - Freigabe: TOM/KAM genehmigt oder lehnt ab
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getAllMkRechnungen, getMkRechnungByOrderNumber, getMkRechnungById, createMkRechnung, updateMkRechnung, getMkPositionenForRechnung, createMkPosition, deleteMkPositionen, getMkNachtraegeForRechnung, createMkNachtrag, getAllMkNachtraege, getMkNachtragById, updateMkNachtrag, deleteMkNachtraegeForRechnung, deleteMkRechnung, getTeamHwpZuordnungen } from "../db";
import { mkRechnungen, mkPositionen, mkNachtraege } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { MK_KATALOG, berechnePauschaleAbzug } from "../../shared/mk-positionen-katalog";
import { getCached, setCached } from "../cache";

const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";
const KLASSI_BASE_ID = "appSZqcdigG1dhdmu";
const MK_BASE_ID = "appjRcTYUcy6lmKx2"; // HI-ACH-Mehrkostenfreigabe
const TABLES = {
  TBK: "tbl877Zz1PpT87y5Z",
  NTBK: "tblHta2AiEFzPW3LF",
  // Konditionen-Tabelle in MK-Base ("Aktuelle Pauschalen")
  HWP_PAUSCHALEN: "tblAWJS4XKLrv4Pd1",
};

function getAirtableKey() {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AIRTABLE_API_KEY nicht gesetzt" });
  return key;
}

type AirtableResponse = { records: Array<{ id: string; fields: Record<string, unknown>; createdTime: string }>; offset?: string };

async function airtableFetch(path: string): Promise<AirtableResponse> {
  const key = getAirtableKey();
  const res = await fetch(`${AIRTABLE_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Airtable Fehler ${res.status}` });
  return res.json() as Promise<AirtableResponse>;
}

async function fetchAllPages(tableId: string) {
  const allRecords: Array<{ id: string; fields: Record<string, unknown>; createdTime: string }> = [];
  let offset: string | undefined;
  do {
    let path = `/${KLASSI_BASE_ID}/${tableId}?pageSize=100`;
    if (offset) path += `&offset=${offset}`;
    const data: AirtableResponse = await airtableFetch(path);
    allRecords.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return allRecords;
}

const positionInputSchema = z.object({
  positionKey: z.string(),
  menge: z.number().int().min(0),
  // Optionale Freitext-Felder (für benutzerdefinierte Positionen)
  isFreitext: z.boolean().optional().default(false),
  freitextBezeichnung: z.string().max(255).optional(),
  freitextEinzelpreis: z.number().int().min(0).optional(), // in Cent
});

export const mehrkostenRouter = router({
  // ─── Kunden aus TBK + nTBK laden (mit Cache) ────────────────────────────────────────────
  listKunden: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      quelle: z.enum(["alle", "tbk", "ntbk"]).default("alle"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(1000).default(50),
      bypassCache: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      // Cache-Keys für TBK und nTBK
      const tbkCacheKey = "klassi:kunden:tbk";
      const ntbkCacheKey = "klassi:kunden:ntbk";

      async function getCachedOrFetch(tableId: string, cacheKey: string) {
        if (!input.bypassCache) {
          const cached = await getCached<Array<{ id: string; fields: Record<string, unknown>; createdTime: string }>>(cacheKey);
          if (cached) return cached;
        }
        const records = await fetchAllPages(tableId);
        await setCached(cacheKey, records).catch(() => {});
        return records;
      }

      const [tbkRecords, ntbkRecords] = await Promise.all([
        input.quelle !== "ntbk" ? getCachedOrFetch(TABLES.TBK, tbkCacheKey) : Promise.resolve([]),
        input.quelle !== "tbk" ? getCachedOrFetch(TABLES.NTBK, ntbkCacheKey) : Promise.resolve([]),
      ]);

      type KundeItem = {
        airtableId: string;
        quelle: "tbk" | "ntbk";
        opportunityName: string;
        orderNumber: string;
        caseNumber: string;
        subject: string;
        createdTime: string;
      };

      const kunden: KundeItem[] = [
        ...tbkRecords.map(r => ({
          airtableId: r.id,
          quelle: "tbk" as const,
          opportunityName: String(r.fields["Opportunity Name"] ?? ""),
          orderNumber: String(r.fields["Order Number"] ?? ""),
          caseNumber: String(r.fields["Fulfilment Case: Case Number"] ?? r.fields["Home Improvement Case: Case Number"] ?? ""),
          subject: String(r.fields["Subject"] ?? ""),
          createdTime: r.createdTime,
        })),
        ...ntbkRecords.map(r => ({
          airtableId: r.id,
          quelle: "ntbk" as const,
          opportunityName: String(r.fields["Opportunity Name"] ?? ""),
          orderNumber: String(r.fields["Order Number"] ?? ""),
          caseNumber: String(r.fields["Case Number"] ?? ""),
          subject: String(r.fields["Subject"] ?? ""),
          createdTime: r.createdTime,
        })),
      ];

      // Prüfen welche bereits eine Rechnung haben
      const existingRechnungen = await getAllMkRechnungen();
      const rechnungMap = new Map(existingRechnungen.map(r => [r.orderNumber, r]));

      // Suche anwenden
      const search = input.search?.toLowerCase() ?? "";
      const filtered = search
        ? kunden.filter(k =>
            k.opportunityName.toLowerCase().includes(search) ||
            k.orderNumber.toLowerCase().includes(search) ||
            k.caseNumber.toLowerCase().includes(search)
          )
        : kunden;

      // Sortierung: neueste zuerst
      filtered.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

      const total = filtered.length;
      const start = (input.page - 1) * input.pageSize;
      const paged = filtered.slice(start, start + input.pageSize);

      return {
        kunden: paged.map(k => ({
          ...k,
          rechnung: rechnungMap.get(k.orderNumber) ?? null,
        })),
        total,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  // ─── HWP-Pauschalen laden (mit Cache) ───────────────────────────────────────────────────
  getPauschalen: protectedProcedure
    .input(z.object({ bypassCache: z.boolean().optional().default(false) }).optional())
    .query(async ({ input }) => {
      const cacheKey = "klassi:hwp_pauschalen";
      if (!input?.bypassCache) {
        const cached = await getCached<Array<{ id: string; hwpName: string; uv1: number; uv2: number; uv3: number; uv4: number }>>(cacheKey);
        if (cached) return cached;
      }
      // Alle Seiten aus der Konditionen-Tabelle (MK-Base) laden
      const allRecords: Array<{ id: string; fields: Record<string, unknown>; createdTime: string }> = [];
      let offset: string | undefined;
      do {
        let path = `/${MK_BASE_ID}/${TABLES.HWP_PAUSCHALEN}?pageSize=100`;
        if (offset) path += `&offset=${encodeURIComponent(offset)}`;
        const data = await airtableFetch(path);
        allRecords.push(...(data.records || []));
        offset = data.offset;
      } while (offset);
      // Neuesten Eintrag pro HWP nach end_date wählen (dedupliziert)
      const latestPerHwp = new Map<string, { id: string; fields: Record<string, unknown>; createdTime: string }>();
      for (const r of allRecords) {
        const name = String(r.fields["HWP_Select"] ?? "").trim();
        if (!name) continue;
        const prev = latestPerHwp.get(name);
        const endDate = String(r.fields["end_date"] ?? "");
        const prevEndDate = prev ? String(prev.fields["end_date"] ?? "") : "";
        if (!prev || endDate > prevEndDate) {
          latestPerHwp.set(name, r);
        }
      }
      const result = Array.from(latestPerHwp.entries())
        .map(([hwpName, r]) => ({
          id: r.id,
          hwpName,
          uv1: Number(r.fields["1_uv"] ?? 0),
          uv2: Number(r.fields["2_uv"] ?? 0),
          uv3: Number(r.fields["3_uv"] ?? 0),
          uv4: Number(r.fields["4_uv"] ?? 0),
          endDate: String(r.fields["end_date"] ?? ""),
        }))
        .sort((a, b) => a.hwpName.localeCompare(b.hwpName, "de"));
      await setCached(cacheKey, result).catch(() => {});
      return result;
    }),

  // ─── Rechnung laden ───────────────────────────────────────────────────────
  getRechnung: protectedProcedure
    .input(z.object({ orderNumber: z.string() }))
    .query(async ({ input }) => {
      const rechnung = await getMkRechnungByOrderNumber(input.orderNumber);
      if (!rechnung) return null;

      const positionen = await getMkPositionenForRechnung(rechnung.id);
      const nachtraege = await getMkNachtraegeForRechnung(rechnung.id);

      return { rechnung, positionen, nachtraege };
    }),

  // ─── Rechnung speichern / aktualisieren ──────────────────────────────────
  saveRechnung: protectedProcedure
    .input(z.object({
      orderNumber: z.string(),
      airtableId: z.string().optional(),
      quelle: z.enum(["tbk", "ntbk"]).optional(),
      kundenName: z.string(),
      hwpName: z.string().optional(),
      hwpAccountId: z.string().optional(),
      uvAnzahl: z.number().int().min(1).max(10),
      pauschaleBetrag: z.number().int().min(0),
      positionen: z.array(positionInputSchema),
      status: z.enum(["entwurf", "abgeschlossen"]).default("entwurf"),
    }))
    .mutation(async ({ input, ctx }) => {
      const pauschaleAbzug = berechnePauschaleAbzug(input.uvAnzahl);

      let summeOhnePauschale = 0;
      let pauschaleSumme = 0;

      const positionenMitPreisen = input.positionen
        .filter(p => p.menge > 0)
        .map(p => {
          // Freitext-Position
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
              quelle: "klassifizierung" as const,
              isFreitext: true,
            };
          }
          // Katalog-Position
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
            quelle: "klassifizierung" as const,
            isFreitext: false,
          };
        })
        .filter(Boolean) as Array<{
          positionKey: string; positionLabel: string; einheit: string;
          einzelpreis: number; menge: number; inPauschaleEnthalten: boolean;
          pauschaleMenge: number; nettomenge: number; gesamtpreis: number;
          quelle: "klassifizierung"; isFreitext: boolean;
        }>;
      const summeMitPauschale = summeOhnePauschale - pauschaleSumme + input.pauschaleBetrag;;

      const existing = await getMkRechnungByOrderNumber(input.orderNumber);

      let rechnungId: number;

      if (existing) {
        await updateMkRechnung(existing.id, {
          kundenName: input.kundenName,
          hwpName: input.hwpName,
          hwpAccountId: input.hwpAccountId,
          uvAnzahl: input.uvAnzahl,
          pauschaleBetrag: input.pauschaleBetrag,
          summeOhnePauschale,
          summeMitPauschale,
          status: input.status,
        });
        rechnungId = existing.id;
        await deleteMkPositionen(rechnungId);
      } else {
        const rechnung = await createMkRechnung({
          orderNumber: input.orderNumber,
          airtableAppointmentsId: input.airtableId,
          kundenName: input.kundenName,
          hwpName: input.hwpName,
          hwpAccountId: input.hwpAccountId,
          uvAnzahl: input.uvAnzahl,
          pauschaleBetrag: input.pauschaleBetrag,
          summeOhnePauschale,
          summeMitPauschale,
          status: input.status,
          erstelltVon: ctx.user.id,
          erstelltVonName: ctx.user.name,
        });
        rechnungId = rechnung.id;
      }

      if (positionenMitPreisen.length > 0) {
        for (const p of positionenMitPreisen) {
          await createMkPosition({ ...p, rechnungId });
        }
      }

      return { rechnungId, summeOhnePauschale, summeMitPauschale, pauschaleSumme };
    }),

  // ─── Alle Rechnungen auflisten ────────────────────────────────────────────
  listRechnungen: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(1000).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const all = (await getAllMkRechnungen())
        .sort((a: any, b: any) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());

      const filtered = all.filter(r => {
        const search = input.search?.toLowerCase() ?? "";
        const matchSearch = !search ||
          (r.kundenName ?? "").toLowerCase().includes(search) ||
          r.orderNumber.toLowerCase().includes(search) ||
          (r.hwpName ?? "").toLowerCase().includes(search);
        const matchStatus = !input.status || r.status === input.status;
        // HWP sieht nur eigene
        const matchHwp = ctx.user.role !== "hwp" || r.hwpAccountId === (ctx.user as { airtableAccountId?: string }).airtableAccountId;
        return matchSearch && matchStatus && matchHwp;
      });

      const total = filtered.length;
      const start = (input.page - 1) * input.pageSize;
      const paged = filtered.slice(start, start + input.pageSize);

      return { rechnungen: paged, total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
    }),

  // ─── Nachtrag einreichen ──────────────────────────────────────────────────
  submitNachtrag: protectedProcedure
    .input(z.object({
      rechnungId: z.number().int(),
      positionen: z.array(positionInputSchema),
      hwpKommentar: z.string().optional(),
      uvAnzahl: z.number().int().min(1).max(10),
      pauschaleBetrag: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const rechnung = await getMkRechnungById(input.rechnungId);
      if (!rechnung) throw new TRPCError({ code: "NOT_FOUND", message: "Rechnung nicht gefunden" });

      const pauschaleAbzug = berechnePauschaleAbzug(input.uvAnzahl);
      let summeOhnePauschale = 0;
      let pauschaleSumme = 0;

       const positionenMitPreisen = input.positionen
        .filter(p => p.menge > 0)
        .map(p => {
          // Freitext-Position
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
          // Katalog-Position
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

      const nachtrag = await createMkNachtrag({
        rechnungId: input.rechnungId,
        eingereichtVon: ctx.user.id,
        eingereichtVonName: ctx.user.name,
        summeOhnePauschale,
        summeMitPauschale,
        hwpKommentar: input.hwpKommentar,
        status: "offen",
      });
      const nachtragId = nachtrag.id;

      if (positionenMitPreisen.length > 0) {
        for (const p of positionenMitPreisen) {
          await createMkPosition({ ...p, rechnungId: input.rechnungId });
        }
      }

      await updateMkRechnung(input.rechnungId, { status: "nachtrag" });

      return { nachtragId, summeOhnePauschale, summeMitPauschale };
    }),

  // ─── Offene Nachträge auflisten ───────────────────────────────────────────
  listNachtraege: protectedProcedure
    .input(z.object({
      status: z.enum(["offen", "freigegeben", "abgelehnt", "alle"]).default("offen"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(1000).default(20),
      teamFilter: z.number().int().optional(), // Team-ID Filter
    }))
    .query(async ({ input }) => {
      const [allNachtraege, allRechnungen] = await Promise.all([
        getAllMkNachtraege(),
        getAllMkRechnungen(),
      ]);
      const rechnungMap = new Map(allRechnungen.map((r) => [r.id, r]));
      const all = allNachtraege
        .map((nachtrag) => ({ nachtrag, rechnung: rechnungMap.get(nachtrag.rechnungId) }))
        .filter((x): x is { nachtrag: any; rechnung: any } => !!x.rechnung)
        .sort((a, b) => new Date(b.nachtrag.eingereichtAt ?? b.nachtrag.createdAt ?? 0).getTime() - new Date(a.nachtrag.eingereichtAt ?? a.nachtrag.createdAt ?? 0).getTime());

      let filtered = input.status === "alle"
        ? all
        : all.filter(r => r.nachtrag.status === input.status);

      // Team-Filter: Nur Nachträge von HWPs des gewählten Teams
      if (input.teamFilter) {
        const teamHwps = await getTeamHwpZuordnungen(input.teamFilter);
        const teamHwpIds = new Set(teamHwps.map(h => h.hwpAccountId));
        filtered = filtered.filter(r =>
          r.rechnung.hwpAccountId ? teamHwpIds.has(r.rechnung.hwpAccountId) : false
        );
      }

      const total = filtered.length;
      const start = (input.page - 1) * input.pageSize;
      const paged = filtered.slice(start, start + input.pageSize);

      return { nachtraege: paged, total, page: input.page, pageSize: input.pageSize, totalPages: Math.ceil(total / input.pageSize) };
    }),

  // ─── Nachtrag freigeben ───────────────────────────────────────────────────
  approveNachtrag: protectedProcedure
    .input(z.object({
      nachtragId: z.number().int(),
      kommentar: z.string().optional(),
      freigegebenerBetrag: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "hwp") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung zur Freigabe" });
      }
      const nachtrag = await getMkNachtragById(input.nachtragId);
      if (!nachtrag) throw new TRPCError({ code: "NOT_FOUND" });

      await updateMkNachtrag(input.nachtragId, {
        status: "freigegeben",
        geprueftVon: ctx.user.id,
        geprueftVonName: ctx.user.name,
        geprueftAt: new Date(),
        prueferKommentar: input.kommentar,
        freigegebenerBetrag: input.freigegebenerBetrag ?? nachtrag.summeMitPauschale,
      });

      await updateMkRechnung(nachtrag.rechnungId, { status: "freigegeben" });

      return { success: true };
    }),

  // ─── Nachtrag ablehnen ────────────────────────────────────────────────────
  rejectNachtrag: protectedProcedure
    .input(z.object({
      nachtragId: z.number().int(),
      kommentar: z.string().min(1, "Ablehnungsgrund erforderlich"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === "hwp") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung" });
      }
      const nachtrag = await getMkNachtragById(input.nachtragId);
      if (!nachtrag) throw new TRPCError({ code: "NOT_FOUND" });

      await updateMkNachtrag(input.nachtragId, {
        status: "abgelehnt",
        geprueftVon: ctx.user.id,
        geprueftVonName: ctx.user.name,
        geprueftAt: new Date(),
        prueferKommentar: input.kommentar,
      });

      await updateMkRechnung(nachtrag.rechnungId, { status: "abgelehnt" });

      return { success: true };
    }),

    // ─── Rechnung löschen ──────────────────────────────────────────────────────
  deleteRechnung: protectedProcedure
    .input(z.object({ rechnungId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      // Interne Nutzer duerfen loeschen, HWP nur unter zusaetzlichen Bedingungen.
      if (ctx.user.role === "hwp") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Keine Berechtigung zum Löschen" });
      }
      // Rechnung laden
      const rechnung = await getMkRechnungById(input.rechnungId);
      if (!rechnung) throw new TRPCError({ code: "NOT_FOUND", message: "Rechnung nicht gefunden" });
      // Anträge, Positionen und Rechnung löschen
      await deleteMkNachtraegeForRechnung(input.rechnungId);
      await deleteMkPositionen(input.rechnungId);
      await deleteMkRechnung(input.rechnungId);
      return { success: true };
    }),

  // ─── Materialkatalog ──────────────────────────────────────────────────────
  getKatalog: protectedProcedure.query(() => MK_KATALOG),
});
