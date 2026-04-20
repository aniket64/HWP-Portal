/**
 * Airtable Cache Service
 * Speichert Airtable-Daten in der Datenbank mit konfigurierbarer TTL.
 * TTL wird aus den App-Einstellungen gelesen (airtable_sync_interval_minutes).
 */

import { eq, lt } from "drizzle-orm";
import { getDb } from "./db";
import { airtableCache, appSettings } from "../drizzle/schema";

// Standard-TTL: 15 Minuten (häufigerer Sync für aktuelle Wochenplanung)
const DEFAULT_TTL_MINUTES = 15;

// Einstellungs-Keys
export const SETTINGS_KEYS = {
  AIRTABLE_SYNC_INTERVAL: "airtable_sync_interval_minutes",
  AIRTABLE_LAST_SYNC: "airtable_last_sync",
  APP_NAME: "app_name",
  ITEMS_PER_PAGE: "items_per_page",
  ENABLE_NOTIFICATIONS: "enable_notifications",
  MAINTENANCE_MODE: "maintenance_mode",
} as const;

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string, userId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy: userId ?? null })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy: userId ?? null, updatedAt: new Date() },
    });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function getTTLMinutes(): Promise<number> {
  const val = await getSetting(SETTINGS_KEYS.AIRTABLE_SYNC_INTERVAL);
  const parsed = val ? parseInt(val, 10) : NaN;
  return isNaN(parsed) || parsed < 1 ? DEFAULT_TTL_MINUTES : parsed;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(airtableCache)
    .where(eq(airtableCache.cacheKey, cacheKey))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Prüfen ob Cache abgelaufen ist
  if (new Date() > row.expiresAt) {
    // Abgelaufenen Cache löschen (non-blocking)
    db.delete(airtableCache).where(eq(airtableCache.cacheKey, cacheKey)).catch(() => {});
    return null;
  }
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(cacheKey: string, data: T): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const ttlMinutes = await getTTLMinutes();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const serialized = JSON.stringify(data);
  await db
    .insert(airtableCache)
    .values({ cacheKey, data: serialized, fetchedAt: new Date(), expiresAt })
    .onConflictDoUpdate({
      target: airtableCache.cacheKey,
      set: { data: serialized, fetchedAt: new Date(), expiresAt },
    });
  // Letzten Sync-Zeitpunkt speichern
  await setSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC, new Date().toISOString());
}

export async function clearCache(pattern?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (pattern) {
    // Alle Cache-Einträge mit diesem Präfix löschen
    const rows = await db.select({ key: airtableCache.cacheKey }).from(airtableCache);
    const toDelete = rows.filter((r) => r.key.startsWith(pattern));
    for (const row of toDelete) {
      await db.delete(airtableCache).where(eq(airtableCache.cacheKey, row.key));
    }
    return toDelete.length;
  }
  // Alles löschen
  const rows = await db.select({ key: airtableCache.cacheKey }).from(airtableCache);
  await db.delete(airtableCache).where(lt(airtableCache.expiresAt, new Date(Date.now() + 999 * 24 * 60 * 60 * 1000)));
  return rows.length;
}

export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
  ttlMinutes: number;
  lastSync: string | null;
}> {
  const db = await getDb();
  if (!db) return { totalEntries: 0, expiredEntries: 0, ttlMinutes: DEFAULT_TTL_MINUTES, lastSync: null };
  const rows = await db.select().from(airtableCache);
  const now = new Date();
  const expired = rows.filter((r) => now > r.expiresAt).length;
  const ttlMinutes = await getTTLMinutes();
  const lastSync = await getSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC);
  return {
    totalEntries: rows.length,
    expiredEntries: expired,
    ttlMinutes,
    lastSync,
  };
}
