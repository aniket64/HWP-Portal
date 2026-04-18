import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const key = process.env.AIRTABLE_API_KEY;
const baseId = 'appjRcTYUcy6lmKx2';
const tableId = 'tblAWJS4XKLrv4Pd1';

async function load(offset) {
  let url = `https://api.airtable.com/v0/${baseId}/${tableId}?pageSize=100`;
  if (offset) url += `&offset=${encodeURIComponent(offset)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  return r.json();
}

let all = [];
let offset;
do {
  const d = await load(offset);
  all.push(...(d.records || []));
  offset = d.offset;
} while (offset);

console.log('Total records:', all.length);

// Neueste pro HWP nach end_date
const latest = {};
for (const r of all) {
  const name = String(r.fields['HWP_Select'] || '').trim();
  if (!name) continue;
  const prev = latest[name];
  if (!prev || (r.fields['end_date'] || '') > (prev.fields['end_date'] || '')) {
    latest[name] = r;
  }
}

console.log('Unique HWPs:', Object.keys(latest).length);
Object.entries(latest).slice(0, 8).forEach(([n, r]) => {
  console.log(`${n}: 1UV=${r.fields['1_uv']} 2UV=${r.fields['2_uv']} 3UV=${r.fields['3_uv']} 4UV=${r.fields['4_uv']} end=${r.fields['end_date']}`);
});
