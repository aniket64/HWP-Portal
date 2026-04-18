import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { deltaSync, fullSync } from "../airtable";
import { getSetting, getTTLMinutes, SETTINGS_KEYS } from "../cache";
import { generateMkAntragPdf } from "../mk-pdf";
import { getDb } from "../db";
import { validateRuntimeEnv } from "./env";
import { mkRechnungen, mkPositionen, mkNachtraege } from "../../drizzle/schema";
import { desc, eq, sql } from "drizzle-orm";
import { verifyJWT, parseCookies, COOKIE_NAME } from "../auth";
import { getUserById } from "../db";

// ─── Auto-Sync-Timer ────────────────────────────────────────────────────────
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let eveningPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownInProgress = false;
let isReady = false;
let lastReadinessError: string | null = null;

type StartupChecks = {
  databaseConfigured: boolean;
  databaseReachable: boolean;
  airtableConfigured: boolean;
  airtableReachable: boolean;
  forgeConfigured: boolean;
  forgeReachable: boolean;
};

const startupChecks: StartupChecks = {
  databaseConfigured: false,
  databaseReachable: false,
  airtableConfigured: false,
  airtableReachable: false,
  forgeConfigured: false,
  forgeReachable: false,
};

/**
 * Plant den nächsten täglichen 18-Uhr-Pre-Fetch.
 * Läuft jeden Abend um 18:00 Uhr (Serverzeit) und führt einen deltaSync durch,
 * damit neue Termine für die nächste Woche rechtzeitig im Portal erscheinen.
 */
function scheduleEveningPrefetch() {
  const now = new Date();
  const next = new Date();
  next.setHours(18, 0, 0, 0);
  // Falls 18:00 Uhr heute schon vorbei ist, morgen planen
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[EveningPrefetch] Nächster Pre-Fetch um ${next.toLocaleTimeString('de-DE')} (in ${Math.round(msUntilNext / 60000)} Min)`);
  if (eveningPrefetchTimer) clearTimeout(eveningPrefetchTimer);
  eveningPrefetchTimer = setTimeout(async () => {
    console.log('[EveningPrefetch] Starte täglichen 18-Uhr-deltaSync...');
    try {
      const result = await deltaSync();
      console.log(`[EveningPrefetch] Abgeschlossen: ${result.updated} aktualisiert, ${result.total} gesamt`);
    } catch (e) {
      console.error('[EveningPrefetch] Fehler:', e);
    }
    // Nächsten Tag planen
    scheduleEveningPrefetch();
  }, msUntilNext);
}

async function scheduleSyncCycle() {
  try {
    const lastSyncStr = await getSetting(SETTINGS_KEYS.AIRTABLE_LAST_SYNC);
    const ttlMinutes = await getTTLMinutes();
    const intervalMs = ttlMinutes * 60 * 1000;

    if (!lastSyncStr) {
      // Noch kein Sync: fullSync starten
      console.log("[AutoSync] Kein vorheriger Sync gefunden – starte fullSync...");
      await fullSync();
    } else {
      const lastSync = new Date(lastSyncStr);
      const msSinceLast = Date.now() - lastSync.getTime();
      if (msSinceLast >= intervalMs) {
        // Fällig: deltaSync ausführen
        console.log(`[AutoSync] Sync fällig (${Math.round(msSinceLast / 60000)} Min seit letztem Sync) – starte deltaSync...`);
        await deltaSync();
      } else {
        const nextInMs = intervalMs - msSinceLast;
        console.log(`[AutoSync] Nächster Sync in ${Math.round(nextInMs / 60000)} Min`);
      }
    }
  } catch (e) {
    console.error("[AutoSync] Fehler:", e);
  }

  // Nächsten Zyklus planen (immer nach aktuellem Intervall)
  const ttlMinutes = await getTTLMinutes().catch(() => 60);
  const intervalMs = ttlMinutes * 60 * 1000;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(scheduleSyncCycle, intervalMs);
  console.log(`[AutoSync] Nächster Sync geplant in ${ttlMinutes} Min`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  if (process.env.NODE_ENV === "production") {
    if (await isPortAvailable(startPort)) {
      return startPort;
    }
    throw new Error(`Required PORT ${startPort} is not available`);
  }

  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function logStartupConfiguration() {
  const configuration = {
    NODE_ENV: process.env.NODE_ENV ?? "undefined",
    PORT: process.env.PORT ?? "3000",
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
    JWT_SECRET: process.env.JWT_SECRET ? "set" : "missing",
    AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY ? "set" : "missing",
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ?? "default",
    AIRTABLE_USERS_TABLE_ID: process.env.AIRTABLE_USERS_TABLE_ID ?? "default",
    AIRTABLE_TEAMS_TABLE_ID: process.env.AIRTABLE_TEAMS_TABLE_ID ?? "default",
    USE_AIRTABLE_USERS: process.env.USE_AIRTABLE_USERS ?? "false",
    USE_AIRTABLE_TEAMS: process.env.USE_AIRTABLE_TEAMS ?? "false",
  };

  console.log("[Startup] Runtime configuration:", configuration);
}

async function verifyDatabaseConnection() {
  startupChecks.databaseConfigured = Boolean(process.env.DATABASE_URL);

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required in production");
    }

    console.warn("[Startup] DATABASE_URL missing; running without SQL persistence");
    return;
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database connection could not be initialized");
  }

  await db.execute(sql`SELECT 1`);
  startupChecks.databaseReachable = true;
  console.log("[Startup] Database connection verified");
}

async function verifyAirtableConnection() {
  startupChecks.airtableConfigured = Boolean(process.env.AIRTABLE_API_KEY);

  if (!startupChecks.airtableConfigured) {
    throw new Error("AIRTABLE_API_KEY is required");
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const usersTableId = process.env.AIRTABLE_USERS_TABLE_ID;
  const teamsTableId = process.env.AIRTABLE_TEAMS_TABLE_ID;

  if (!baseId || !usersTableId || !teamsTableId) {
    throw new Error(
      "AIRTABLE_BASE_ID, AIRTABLE_USERS_TABLE_ID, and AIRTABLE_TEAMS_TABLE_ID are required"
    );
  }

  const headers = {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
  };

  const usersUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(usersTableId)}?maxRecords=1`;
  const teamsUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(teamsTableId)}?maxRecords=1`;

  const [usersRes, teamsRes] = await Promise.all([
    fetch(usersUrl, { headers }),
    fetch(teamsUrl, { headers }),
  ]);

  if (!usersRes.ok || !teamsRes.ok) {
    const usersError = usersRes.ok ? "ok" : await usersRes.text();
    const teamsError = teamsRes.ok ? "ok" : await teamsRes.text();
    throw new Error(
      `Airtable validation failed (users=${usersRes.status}: ${usersError}; teams=${teamsRes.status}: ${teamsError})`
    );
  }

  startupChecks.airtableReachable = true;
  console.log("[Startup] Airtable connectivity verified");
}

async function verifyForgeConnection() {
  const forgeUrl = process.env.BUILT_IN_FORGE_API_URL;
  const forgeKey = process.env.BUILT_IN_FORGE_API_KEY;

  startupChecks.forgeConfigured = Boolean(forgeUrl) && Boolean(forgeKey);
  if (!startupChecks.forgeConfigured) {
    throw new Error(
      "BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY are required"
    );
  }

  const baseUrl = forgeUrl!.endsWith("/") ? forgeUrl! : `${forgeUrl!}/`;
  const url = new URL("v1/storage/downloadUrl", baseUrl);
  url.searchParams.set("path", "render-preflight.txt");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${forgeKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Forge storage validation failed (${res.status} ${res.statusText}): ${body}`
    );
  }

  startupChecks.forgeReachable = true;
  console.log("[Startup] Forge storage connectivity verified");
}

function buildReadinessPayload() {
  const ok =
    startupChecks.databaseConfigured &&
    startupChecks.databaseReachable &&
    startupChecks.airtableConfigured &&
    startupChecks.airtableReachable &&
    startupChecks.forgeConfigured &&
    startupChecks.forgeReachable &&
    isReady;

  return {
    ok,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV ?? "undefined",
    checks: startupChecks,
    isReady,
    lastReadinessError,
  };
}

async function shutdown(server: ReturnType<typeof createServer>, signal: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log(`[Shutdown] Received ${signal}, shutting down...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[Shutdown] Forced exit after timeout");
    process.exit(1);
  }, 10000);

  if (syncTimer) clearTimeout(syncTimer);
  if (eveningPrefetchTimer) clearTimeout(eveningPrefetchTimer);

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  clearTimeout(forceExitTimer);
  console.log("[Shutdown] HTTP server closed");
  process.exit(0);
}

async function startServer() {
  validateRuntimeEnv();

  const app = express();
  const server = createServer(app);
  // Trust proxy so secure cookies work behind TLS termination.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? "undefined",
    });
  });

  app.get("/api/ready", (_req, res) => {
    const payload = buildReadinessPayload();
    res.status(payload.ok ? 200 : 503).json(payload);
  });

  // ─── PDF-Endpunkt für Mehrkosten-Anträge ─────────────────────────────────
  app.get("/api/mk-antrag/:rechnungId/pdf", async (req, res) => {
    try {
      let token: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
      if (!token) {
        const cookieStr = req.headers.cookie ?? "";
        token = parseCookies(cookieStr).get(COOKIE_NAME);
      }
      if (!token) { res.status(401).json({ error: "Nicht angemeldet" }); return; }
      const payload = await verifyJWT(token);
      if (!payload) { res.status(401).json({ error: "Ungültiger Token" }); return; }
      const user = await getUserById(payload.userId);
      if (!user) { res.status(401).json({ error: "Benutzer nicht gefunden" }); return; }
      const rechnungId = parseInt(req.params.rechnungId, 10);
      if (isNaN(rechnungId)) { res.status(400).json({ error: "Ungültige ID" }); return; }
      const db = await getDb();
      if (!db) { res.status(500).json({ error: "Datenbankfehler" }); return; }
      const [rechnung] = await db.select().from(mkRechnungen).where(eq(mkRechnungen.id, rechnungId)).limit(1);
      if (!rechnung) { res.status(404).json({ error: "Antrag nicht gefunden" }); return; }
      // HWP darf nur eigene Anträge laden
      if (user.role === "hwp" && rechnung.hwpAccountId !== user.airtableAccountId) {
        res.status(403).json({ error: "Kein Zugriff" }); return;
      }
      const positionen = await db.select().from(mkPositionen)
        .where(eq(mkPositionen.rechnungId, rechnungId)).orderBy(mkPositionen.id);
      const nachtraege = await db.select().from(mkNachtraege)
        .where(eq(mkNachtraege.rechnungId, rechnungId)).orderBy(desc(mkNachtraege.eingereichtAt));
      const pdfBuffer = await generateMkAntragPdf({ rechnung, positionen, nachtraege });
      const filename = `MK-Antrag-${rechnung.orderNumber}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (e) {
      console.error("[PDF] Fehler:", e);
      res.status(500).json({ error: "PDF-Generierung fehlgeschlagen" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  logStartupConfiguration();
  await verifyDatabaseConnection();
  await verifyAirtableConnection();
  await verifyForgeConnection();

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    isReady = true;
    lastReadinessError = null;
    console.log(`Server running on http://localhost:${port}/`);
    // Auto-Sync nach 5 Sekunden starten (damit DB-Verbindung bereit ist)
    setTimeout(() => {
      scheduleSyncCycle().catch(e => console.error("[AutoSync] Startfehler:", e));
      // Täglichen 18-Uhr-Pre-Fetch planen
      scheduleEveningPrefetch();
    }, 5000);
  });

  process.on("SIGTERM", () => {
    void shutdown(server, "SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown(server, "SIGINT");
  });
}

startServer().catch((error) => {
  isReady = false;
  lastReadinessError = error instanceof Error ? error.message : String(error);
  console.error(error);
  process.exit(1);
});
