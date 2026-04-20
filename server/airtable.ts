/**
 * Airtable Service für HI-ACH-Mehrkostenfreigabe
 * Base ID: appjRcTYUcy6lmKx2
 *
 * Cache-Strategie:
 * - Jeder Airtable-Datensatz wird als eigene Zeile in der `auftraege`-Tabelle gespeichert
 * - fullSync: Lädt ALLE Seiten von Airtable und speichert/aktualisiert jeden Datensatz
 * - deltaSync: Lädt nur Einträge die seit dem letzten Sync geändert wurden (via filterByFormula)
 * - Auto-Sync: Wenn Tabelle leer, wird automatisch fullSync ausgeführt
 */

import { getCached, setCached, getSetting, setSetting, SETTINGS_KEYS } from "./cache";
import { getDb } from "./db";
import { auftraege } from "../drizzle/schema";
import { eq, sql, and, or, like, gte, lte, isNotNull } from "drizzle-orm";

const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";
const BASE_ID = "appjRcTYUcy6lmKx2";
const memoryAuftraegeCache = new Map<string, ReturnType<typeof recordToRow>>();

// Tabellen-IDs
export const TABLES = {
  MEHRKOSTENFREIGABE: "tbl7Ic2j1ozM0sTjF",
  CRAFT_APPOINTMENTS: "tblvBWCZgCWse4zjE",
  INVOICE_DIFFERENZ: "tblqIIGu6fRrsBHFj",
  SERVICE_RESSOURCEN: "tblVuIY4TO1Odxew2",
  MK_RECHNER_LISTE: "tbl8nmGskjLmc30zn",
  MK_RECHNER_DATA: "tbl1Ins5mUccKZ0PU",
  AKTUELLE_PAUSCHALEN: "tblAWJS4XKLrv4Pd1",
  MK_RECHNER_CALCULATION: "tblWbywOhpJxAtgZf",
  MATERIAL_CATEGORIES: "tblcEoQ6UDR2AJcXo",
} as const;

export type MehrkostenRecord = {
  id: string;
  fields: {
    "Opportunity Name"?: string;
    "Appointment Number"?: string;
    "Order Number"?: string;
    "Technician: Name"?: string;
    "Technician: Account: Account Name"?: string;
    "Technician: Account: Account ID"?: string;
    Status?: string;
    Skill?: string[];
    Mehrkosten?: number;
    Pauschale?: number;
    "Erwartete Kosten"?: number;
    Rechnungsbetrag?: number;
    "Rechnungs-Nr."?: string;
    Differenz?: number;
    "1. Freigabe"?: string;
    "2. Freigabe"?: string;
    "1. Prüfer - Kommentar"?: string;
    "2. Prüfer - Kommentar"?: string;
    "Status - Freigabe"?: string;
    "Antrag erfolgreich"?: string;
    Grund?: string[];
    Sondertour?: string;
    "Sondertour Kosten"?: number;
    "Last Scheduled End"?: string;
    "Target End"?: string;
    "Created Date"?: string;
    "Assigned PL"?: string;
    "PV or HP"?: string;
    "Battery Capacity kwh"?: number;
    "Number of Wallboxes"?: number;
    "Number Of Module Components"?: number;
    Amounts?: number;
    Amount?: number;
    "SF-Link SA"?: string;
    "Service Appointment ID"?: string;
    Ausfallpauschale?: boolean;
    "Freigegebene Mehrkosten"?: number;
    "MK-Status = Freigegeben, %"?: number;
    "Baustelle mit ZZL"?: number;
    "Mehrkosten (Indikator)"?: number;
    "Sondertour (Indikator)"?: number;
    "Zuletzt geändert"?: string;
    [key: string]: unknown;
  };
  createdTime: string;
};

export type AirtableResponse = {
  records: MehrkostenRecord[];
  offset?: string;
};

export type ServiceRessource = {
  id: string;
  fields: {
    Name?: string;
    "Account Name"?: string;
    "Account ID"?: string;
    Email?: string;
    Phone?: string;
    Skills?: string[];
    [key: string]: unknown;
  };
  createdTime: string;
};

export type AktuellesPauschal = {
  id: string;
  fields: {
    Pauschalen_ID?: string;
    HWP_Select?: string;
    start_date?: string;
    end_date?: string;
    "1_uv"?: number;
    "2_uv"?: number;
    "3_uv"?: number;
    "4_uv"?: number;
    okf?: number;
    storno?: number;
    max_distance?: number;
    sondertouren?: number;
    "Sondertour-Ausfall"?: number;
    zusatzvereinbarungen?: string;
    "account_id (from HWP_Select)"?: string;
    [key: string]: unknown;
  };
  createdTime: string;
};

export type PauschalenUpdateFields = {
  "1_uv"?: number;
  "2_uv"?: number;
  "3_uv"?: number;
  "4_uv"?: number;
  okf?: number;
  storno?: number;
  max_distance?: number;
  sondertouren?: number;
  "Sondertour-Ausfall"?: number;
  zusatzvereinbarungen?: string;
  start_date?: string;
  end_date?: string;
};

function getApiKey(): string {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY nicht gesetzt");
  return key;
}

async function airtableFetch(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable API Fehler ${response.status}: ${error}`);
  }
  return response.json();
}

// ─── Hilfsfunktion: Datensatz in DB-Row umwandeln ────────────────────────────

function recordToRow(record: MehrkostenRecord) {
  const f = record.fields;
  return {
    airtableId: record.id,
    opportunityName: (f["Opportunity Name"] as string) ?? null,
    appointmentNumber: (f["Appointment Number"] as string) ?? null,
    orderNumber: (f["Order Number"] as string) ?? null,
    technicianName: (f["Technician: Name"] as string) ?? null,
    technicianAccountName: (f["Technician: Account: Account Name"] as string) ?? null,
    technicianAccountId: (f["Technician: Account: Account ID"] as string) ?? null,
    status: (f["Status"] as string) ?? null,
    statusFreigabe: (f["Status - Freigabe"] as string) ?? null,
    mehrkosten: f["Mehrkosten"] != null ? String(f["Mehrkosten"]) : null,
    pauschale: f["Pauschale"] != null ? String(f["Pauschale"]) : null,
    createdDate: (f["Created Date"] as string) ?? null,
    lastScheduledEnd: (f["Last Scheduled End"] as string) ?? null,
    targetEnd: (f["Target End"] as string) ?? null,
    fieldsJson: JSON.stringify(f),
    airtableCreatedTime: record.createdTime ?? null,
    zuletzt_geaendert: (f["Zuletzt geändert"] as string) ?? null,
  };
}

// ─── Batch-Insert/Update in DB ────────────────────────────────────────────────

async function upsertRecordsBatch(records: MehrkostenRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDb();

  // Airtable-only fallback: persist records in process memory when no SQL DB is configured.
  if (!db) {
    for (const record of records) {
      const row = recordToRow(record);
      memoryAuftraegeCache.set(row.airtableId, row);
    }
    return;
  }

  // In Batches von 200 upserten um Query-Größe zu begrenzen
  const BATCH_SIZE = 200;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const rows = batch.map(recordToRow);
    await db
      .insert(auftraege)
      .values(rows)
      .onConflictDoUpdate({
        target: auftraege.airtableId,
        set: {
          opportunityName: sql`excluded."opportunityName"`,
          appointmentNumber: sql`excluded."appointmentNumber"`,
          orderNumber: sql`excluded."orderNumber"`,
          technicianName: sql`excluded."technicianName"`,
          technicianAccountName: sql`excluded."technicianAccountName"`,
          technicianAccountId: sql`excluded."technicianAccountId"`,
          status: sql`excluded."status"`,
          statusFreigabe: sql`excluded."statusFreigabe"`,
          mehrkosten: sql`excluded."mehrkosten"`,
          pauschale: sql`excluded."pauschale"`,
          createdDate: sql`excluded."createdDate"`,
          lastScheduledEnd: sql`excluded."lastScheduledEnd"`,
          targetEnd: sql`excluded."targetEnd"`,
          fieldsJson: sql`excluded."fieldsJson"`,
          airtableCreatedTime: sql`excluded."airtableCreatedTime"`,
          zuletzt_geaendert: sql`excluded."zuletzt_geaendert"`,
          syncedAt: new Date(),
        },
      });
  }
}

// ─── Vollständiger Sync ───────────────────────────────────────────────────────

export async function fullSync(): Promise<{ count: number; pages: number }> {
  let allRecords: MehrkostenRecord[] = [];
  let offset: string | undefined;
  let pages = 0;

  console.log("[Airtable] Starte vollständigen Sync...");

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    params.set("sort[0][field]", "Created Date");
    params.set("sort[0][direction]", "desc");
    if (offset) params.set("offset", offset);

    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.MEHRKOSTENFREIGABE}?${params}`;
    const result = await airtableFetch(url) as AirtableResponse;

    allRecords = allRecords.concat(result.records);
    offset = result.offset;
    pages++;

    // Alle 10 Seiten in DB schreiben um Speicher zu sparen
    if (allRecords.length >= 1000 || !offset) {
      await upsertRecordsBatch(allRecords);
      console.log(`[Airtable] ${pages} Seiten verarbeitet, ${allRecords.length} Einträge gespeichert`);
      allRecords = [];
    }

    // Kurze Pause zwischen Requests
    if (offset) await new Promise((r) => setTimeout(r, 150));
  } while (offset);

  const db = await getDb();
  const totalCount = db
    ? Number((await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege))[0]?.count ?? 0)
    : memoryAuftraegeCache.size;

  await setSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC, new Date().toISOString());
  // Stats-Cache invalidieren
  await setCached("mehrkosten_stats:all", null).catch(() => {});

  console.log(`[Airtable] Vollständiger Sync abgeschlossen: ${totalCount} Einträge gesamt in ${pages} Seiten`);
  return { count: totalCount, pages };
}

// ─── Delta-Sync ───────────────────────────────────────────────────────────────

export async function deltaSync(): Promise<{ updated: number; total: number }> {
  const lastSyncStr = await getSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC);

  if (!lastSyncStr) {
    const result = await fullSync();
    return { updated: result.count, total: result.count };
  }

  // 5 Minuten Puffer
  const lastSync = new Date(lastSyncStr);
  lastSync.setMinutes(lastSync.getMinutes() - 5);
  const sinceStr = lastSync.toISOString();

  const formula = encodeURIComponent(`IS_AFTER({Zuletzt geändert}, "${sinceStr}")`);
  const changedRecords: MehrkostenRecord[] = [];
  let offset: string | undefined;

  console.log(`[Airtable] Delta-Sync seit ${sinceStr}...`);

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    params.set("filterByFormula", `IS_AFTER({Zuletzt geändert}, "${sinceStr}")`);
    if (offset) params.set("offset", offset);

    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.MEHRKOSTENFREIGABE}?${params}`;
    const result = await airtableFetch(url) as AirtableResponse;

    changedRecords.push(...result.records);
    offset = result.offset;
    if (offset) await new Promise((r) => setTimeout(r, 150));
  } while (offset);

  if (changedRecords.length > 0) {
    await upsertRecordsBatch(changedRecords);
  }

  await setSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC, new Date().toISOString());
  await setCached("mehrkosten_stats:all", null).catch(() => {});

  const db = await getDb();
  const totalCount = db
    ? Number((await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege))[0]?.count ?? 0)
    : memoryAuftraegeCache.size;

  console.log(`[Airtable] Delta-Sync: ${changedRecords.length} aktualisiert, ${totalCount} gesamt`);
  return { updated: changedRecords.length, total: totalCount };
}

// ─── Alle Datensätze aus DB lesen ────────────────────────────────────────────

export async function getAllCachedRecords(accountId?: string): Promise<MehrkostenRecord[]> {
  const db = await getDb();
  if (!db) {
    if (memoryAuftraegeCache.size === 0) {
      console.log("[Airtable] Memory-Cache leer – starte Auto-Sync...");
      await fullSync();
    }

    const rows = Array.from(memoryAuftraegeCache.values()).filter((row) => {
      if (!accountId) return true;
      return row.technicianAccountId === accountId;
    });

    return rows.map((row) => ({
      id: row.airtableId,
      createdTime: row.airtableCreatedTime ?? "",
      fields: (() => {
        try {
          return JSON.parse(row.fieldsJson);
        } catch {
          return {};
        }
      })(),
    }));
  }

  // Prüfen ob Tabelle leer ist → Auto-Sync
  const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege);
  const count = Number(countResult[0]?.count ?? 0);

  if (count === 0) {
    console.log("[Airtable] Tabelle leer – starte Auto-Sync...");
    await fullSync();
  }

  // Daten aus DB laden
  let rows;
  if (accountId) {
    rows = await db.select().from(auftraege).where(eq(auftraege.technicianAccountId, accountId));
  } else {
    rows = await db.select().from(auftraege);
  }

  // DB-Rows zurück in MehrkostenRecord-Format konvertieren
  return rows.map((row) => ({
    id: row.airtableId,
    createdTime: row.airtableCreatedTime ?? "",
    fields: (() => {
      try {
        return JSON.parse(row.fieldsJson);
      } catch {
        return {};
      }
    })(),
  }));
}

// ─── Einzelner Datensatz ──────────────────────────────────────────────────────

export async function getMehrkostenById(
  recordId: string,
  bypassCache = false
): Promise<MehrkostenRecord> {
  if (!bypassCache) {
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(auftraege).where(eq(auftraege.airtableId, recordId)).limit(1);
      if (rows.length > 0) {
        const row = rows[0];
        return {
          id: row.airtableId,
          createdTime: row.airtableCreatedTime ?? "",
          fields: (() => {
            try { return JSON.parse(row.fieldsJson); } catch { return {}; }
          })(),
        };
      }
    } else {
      const row = memoryAuftraegeCache.get(recordId);
      if (row) {
        return {
          id: row.airtableId,
          createdTime: row.airtableCreatedTime ?? "",
          fields: (() => {
            try {
              return JSON.parse(row.fieldsJson);
            } catch {
              return {};
            }
          })(),
        };
      }
    }
  }

  // Direkt von Airtable laden
  const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.MEHRKOSTENFREIGABE}/${recordId}`;
  const result = await airtableFetch(url) as MehrkostenRecord;

  // In DB speichern
  await upsertRecordsBatch([result]).catch(() => {});
  return result;
}

// ─── Kompatibilitäts-Wrapper ─────────────────────────────────────────────────

export type GetMehrkostenOptions = {
  pageSize?: number;
  offset?: string;
  filterByFormula?: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  accountId?: string;
  bypassCache?: boolean;
};

export async function getMehrkostenRecords(
  options: GetMehrkostenOptions = {}
): Promise<AirtableResponse> {
  const { accountId } = options;
  const records = await getAllCachedRecords(accountId);
  return { records };
}

// ─── Service-Ressourcen ───────────────────────────────────────────────────────

export async function getServiceRessourcen(bypassCache = false): Promise<{
  records: ServiceRessource[];
}> {
  const cacheKey = "service_ressourcen:all";
  if (!bypassCache) {
    const cached = await getCached<{ records: ServiceRessource[] }>(cacheKey);
    if (cached) return cached;
  }
  const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.SERVICE_RESSOURCEN}?pageSize=100`;
  const result = await airtableFetch(url) as { records: ServiceRessource[] };
  await setCached(cacheKey, result).catch(() => {});
  return result;
}

// ─── Aktuelle Pauschalen ────────────────────────────────────────────────────

export async function getAktuellePauschalen(bypassCache = false): Promise<{
  records: AktuellesPauschal[];
}> {
  const cacheKey = "pauschalen:all";
  if (!bypassCache) {
    const cached = await getCached<{ records: AktuellesPauschal[] }>(cacheKey);
    if (cached) return cached;
  }

  // Alle Seiten laden (31 Einträge, passt auf eine Seite)
  const allRecords: AktuellesPauschal[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    params.set("sort[0][field]", "HWP_Select");
    params.set("sort[0][direction]", "asc");
    if (offset) params.set("offset", offset);
    const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.AKTUELLE_PAUSCHALEN}?${params}`;
    const result = await airtableFetch(url) as { records: AktuellesPauschal[]; offset?: string };
    allRecords.push(...result.records);
    offset = result.offset;
  } while (offset);

  const response = { records: allRecords };
  await setCached(cacheKey, response).catch(() => {}); // Cache (TTL aus Einstellungen)
  return response;
}

/** Pauschalen-Felder eines Eintrags direkt in Airtable aktualisieren */
export async function updatePauschaleInAirtable(
  recordId: string,
  fields: PauschalenUpdateFields
): Promise<AktuellesPauschal> {
  const url = `${AIRTABLE_BASE_URL}/${BASE_ID}/${TABLES.AKTUELLE_PAUSCHALEN}/${recordId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable PATCH Fehler ${response.status}: ${error}`);
  }
  // Cache invalidieren
  await setCached("pauschalen:all", null).catch(() => {});
  return response.json() as Promise<AktuellesPauschal>;
}

// ─── Statistiken ─────────────────────────────────────────────────────────────

export type MehrkostenStats = {
  total: number;
  freigegeben: number;
  abgelehnt: number;
  ausstehend: number;
  gesamtMehrkosten: number;
  gesamtPauschale: number;
};

export async function getMehrkostenStats(
  accountId?: string,
  bypassCache = false
): Promise<MehrkostenStats> {
  const cacheKey = `mehrkosten_stats:${accountId ?? "all"}`;
  if (!bypassCache) {
    const cached = await getCached<MehrkostenStats>(cacheKey);
    if (cached) return cached;
  }

  const db = await getDb();
  if (!db) {
    if (memoryAuftraegeCache.size === 0) {
      await fullSync();
    }

    const rows = Array.from(memoryAuftraegeCache.values()).filter((row) => {
      if (!accountId) return true;
      return row.technicianAccountId === accountId;
    });

    const total = rows.length;
    const freigegeben = rows.filter((row) => (row.statusFreigabe ?? "").includes("Freigegeben")).length;
    const abgelehnt = rows.filter((row) => (row.statusFreigabe ?? "").includes("Abgelehnt")).length;

    let gesamtMehrkosten = 0;
    let gesamtPauschale = 0;
    for (const row of rows) {
      gesamtMehrkosten += parseFloat(row.mehrkosten ?? "0") || 0;
      gesamtPauschale += parseFloat(row.pauschale ?? "0") || 0;
    }

    const stats: MehrkostenStats = {
      total,
      freigegeben,
      abgelehnt,
      ausstehend: total - freigegeben - abgelehnt,
      gesamtMehrkosten,
      gesamtPauschale,
    };

    await setCached(cacheKey, stats).catch(() => {});
    return stats;
  }

  // Prüfen ob Tabelle leer
  const countResult = await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege);
  if (Number(countResult[0]?.count ?? 0) === 0) {
    await fullSync();
  }

  // Stats direkt per SQL berechnen
  const whereClause = accountId ? eq(auftraege.technicianAccountId, accountId) : undefined;

  const totalResult = whereClause
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege).where(whereClause)
    : await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege);

  const freigegebenResult = whereClause
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege).where(and(whereClause, like(auftraege.statusFreigabe, "%Freigegeben%")))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege).where(like(auftraege.statusFreigabe, "%Freigegeben%"));

  const abgelehntResult = whereClause
    ? await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege).where(and(whereClause, like(auftraege.statusFreigabe, "%Abgelehnt%")))
    : await db.select({ count: sql<number>`COUNT(*)` }).from(auftraege).where(like(auftraege.statusFreigabe, "%Abgelehnt%"));

  const total = Number(totalResult[0]?.count ?? 0);
  const freigegeben = Number(freigegebenResult[0]?.count ?? 0);
  const abgelehnt = Number(abgelehntResult[0]?.count ?? 0);

  // Summen aus fieldsJson berechnen (nur für Einträge mit Mehrkosten)
  const rows = whereClause
    ? await db.select({ mehrkosten: auftraege.mehrkosten, pauschale: auftraege.pauschale }).from(auftraege).where(whereClause)
    : await db.select({ mehrkosten: auftraege.mehrkosten, pauschale: auftraege.pauschale }).from(auftraege);

  let gesamtMehrkosten = 0;
  let gesamtPauschale = 0;
  for (const row of rows) {
    gesamtMehrkosten += parseFloat(row.mehrkosten ?? "0") || 0;
    gesamtPauschale += parseFloat(row.pauschale ?? "0") || 0;
  }

  const stats: MehrkostenStats = {
    total,
    freigegeben,
    abgelehnt,
    ausstehend: total - freigegeben - abgelehnt,
    gesamtMehrkosten,
    gesamtPauschale,
  };

  await setCached(cacheKey, stats).catch(() => {});
  return stats;
}
