#!/usr/bin/env node

import { createConnection } from "mysql2/promise";

const requiredEnv = [
  "DATABASE_URL",
  "JWT_SECRET",
  "AIRTABLE_API_KEY",
  "AIRTABLE_BASE_ID",
  "AIRTABLE_USERS_TABLE_ID",
  "AIRTABLE_TEAMS_TABLE_ID",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
];

function getMissingRequiredEnv() {
  return requiredEnv.filter((key) => {
    const value = process.env[key];
    return !value || !value.trim();
  });
}

function assertBooleanFlag(name) {
  const value = process.env[name];
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be either \"true\" or \"false\", received: ${value ?? "undefined"}`);
  }
}

async function verifyDatabaseConnection() {
  const connection = await createConnection(process.env.DATABASE_URL);
  try {
    await connection.query("SELECT 1");
  } finally {
    await connection.end();
  }
}

async function verifyAirtableConnectivity() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const usersTableId = process.env.AIRTABLE_USERS_TABLE_ID;
  const teamsTableId = process.env.AIRTABLE_TEAMS_TABLE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  const headers = {
    Authorization: `Bearer ${apiKey}`,
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
}

async function verifyForgeConnectivity() {
  const baseUrl = process.env.BUILT_IN_FORGE_API_URL;
  const apiKey = process.env.BUILT_IN_FORGE_API_KEY;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL("v1/storage/downloadUrl", normalizedBaseUrl);
  url.searchParams.set("path", "render-preflight.txt");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Forge validation failed (${res.status} ${res.statusText}): ${body}`
    );
  }
}

async function main() {
  console.log("[preflight] Starting Render deployment preflight checks...");

  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  assertBooleanFlag("USE_AIRTABLE_USERS");
  assertBooleanFlag("USE_AIRTABLE_TEAMS");

  await verifyDatabaseConnection();
  await verifyAirtableConnectivity();
  await verifyForgeConnectivity();

  console.log("[preflight] Environment variables validated");
  console.log("[preflight] Database connectivity verified");
  console.log("[preflight] Airtable connectivity verified");
  console.log("[preflight] Forge connectivity verified");
  console.log("[preflight] Render deployment preflight checks passed");
}

main().catch((error) => {
  console.error("[preflight] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
