const AIRTABLE_BASE_URL = "https://api.airtable.com/v0";

function getApiKey() {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY not set");
  return key;
}

function getBaseId() {
  return process.env.AIRTABLE_BASE_ID ?? "appjRcTYUcy6lmKx2";
}

async function airtableFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...(opts || {}),
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(opts && (opts.headers as Record<string, string>)),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Airtable error ${res.status}: ${txt}`);
  }
  return res.json();
}

async function fetchAllPages(table: string, params?: Record<string, string>) {
  const all: any[] = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams(params || {});
    if (offset) qs.set("offset", offset);
    qs.set("pageSize", "100");
    const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}?${qs.toString()}`;
    const data = (await airtableFetch(path)) as any;
    all.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return all;
}

function mapUserRecord(rec: any) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    email: f.Email ?? null,
    passwordHash: f["Password Hash"] ?? null,
    name: f.Name ?? null,
    role: f.Role ?? null,
    airtableAccountId: f["Airtable Account ID"] ?? null,
    companyName: f["Company Name"] ?? null,
    assignedHwpAccounts: Array.isArray(f["Assigned HWP Accounts"]) ? f["Assigned HWP Accounts"] : (f["Assigned HWP Accounts"] ? String(f["Assigned HWP Accounts"]).split(/\r?\n/) : []),
    isActive: !!f["Is Active"],
    lastSignedIn: f["Last Signed In"] ?? null,
    createdAt: rec.createdTime ?? null,
    updatedAt: f["_lastModifiedTime"] ?? null,
  };
}

export async function getUserByEmailAirtable(email: string) {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const formula = `LOWER({Email})='${email.toLowerCase().replace(/'/g, "\\'")}'`;
  const records = await fetchAllPages(table, { filterByFormula: formula });
  if (!records || records.length === 0) return undefined;
  return mapUserRecord(records[0]);
}

export async function getUserByIdAirtable(id: string) {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  const rec = await airtableFetch(path);
  return mapUserRecord(rec);
}

export async function getAllUsersAirtable() {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const records = await fetchAllPages(table);
  return records.map(mapUserRecord);
}

export async function createUserAirtable(fields: Record<string, unknown>) {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}`;
  const body = { fields };
  const res = await airtableFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return mapUserRecord(res);
}

export async function updateUserAirtable(id: string, fields: Record<string, unknown>) {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  const body = { fields };
  const res = await airtableFetch(path, { method: "PATCH", body: JSON.stringify(body) });
  return mapUserRecord(res);
}

export async function deleteUserAirtable(id: string) {
  const table = process.env.AIRTABLE_USERS_TABLE_ID ?? "Users";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  await airtableFetch(path, { method: "DELETE" });
  return true;
}

// Teams
function mapTeamRecord(rec: any) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    name: f["Team Name"] ?? f.Name ?? null,
    beschreibung: f["Beschreibung"] ?? null,
    members: f["Members"] ?? [], // array of record IDs
    hwpAccounts: Array.isArray(f["HWP Accounts"]) ? f["HWP Accounts"] : (f["HWP Accounts"] ? String(f["HWP Accounts"]).split(/\r?\n/) : []),
    createdBy: f["Created By"] ?? null,
    createdAt: rec.createdTime,
    updatedAt: f["_lastModifiedTime"] ?? null,
  };
}

export async function getAllTeamsAirtable() {
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const records = await fetchAllPages(table);
  return records.map(mapTeamRecord);
}

export async function getTeamByIdAirtable(id: string) {
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  const rec = await airtableFetch(path);
  return mapTeamRecord(rec);
}

export async function createTeamAirtable(fields: Record<string, unknown>) {
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}`;
  const res = await airtableFetch(path, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return mapTeamRecord(res);
}

export async function updateTeamAirtable(id: string, fields: Record<string, unknown>) {
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  const res = await airtableFetch(path, { method: "PATCH", body: JSON.stringify({ fields }) });
  return mapTeamRecord(res);
}

export async function deleteTeamAirtable(id: string) {
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const path = `${AIRTABLE_BASE_URL}/${getBaseId()}/${encodeURIComponent(table)}/${id}`;
  await airtableFetch(path, { method: "DELETE" });
  return true;
}

export async function getTeamMitgliederWithUsersAirtable(teamId: string) {
  const team = await getTeamByIdAirtable(teamId);
  const members = team.members || [];
  if (!members || members.length === 0) return [];
  // fetch each user
  const users = await Promise.all(members.map((id: string) => getUserByIdAirtable(id)));
  return users;
}

export async function setTeamMitgliederAirtable(teamId: string, userIds: string[]) {
  // update Team record's Members field
  await updateTeamAirtable(teamId, { Members: userIds });
  return true;
}

export async function getTeamHwpZuordnungenAirtable(teamId: string) {
  const team = await getTeamByIdAirtable(teamId);
  return team.hwpAccounts || [];
}

export async function setTeamHwpZuordnungenAirtable(teamId: string, hwps: string | string[]) {
  await updateTeamAirtable(teamId, { "HWP Accounts": hwps });
  return true;
}

export async function getTeamIdsForUserAirtable(userId: string) {
  // find teams where Members contains this userId
  const table = process.env.AIRTABLE_TEAMS_TABLE_ID ?? "Team";
  const formula = `FIND('${userId}', ARRAYJOIN({Members}, ','))`;
  const records = await fetchAllPages(table, { filterByFormula: formula });
  return records.map((r: any) => r.id);
}
