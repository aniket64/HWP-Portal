import { config } from "dotenv";
config();

const key = process.env.AIRTABLE_API_KEY;
const url = "https://api.airtable.com/v0/appjRcTYUcy6lmKx2/tbl7Ic2j1ozM0sTjF?pageSize=100&fields[]=Technician%3A+Account%3A+Account+Name&fields[]=Technician%3A+Account%3A+Account+ID";

const resp = await fetch(url, { headers: { Authorization: "Bearer " + key } });
const d = await resp.json();

if (d.error) {
  console.log("ERROR:", JSON.stringify(d));
  process.exit(1);
}

const seen = new Set();
const accounts = [];
for (const r of d.records) {
  const id = r.fields["Technician: Account: Account ID"];
  const name = r.fields["Technician: Account: Account Name"];
  if (id && !seen.has(id)) {
    seen.add(id);
    accounts.push({ id, name });
  }
}

console.log("Unique HWP accounts found:", accounts.length);
console.log("Sample:", JSON.stringify(accounts.slice(0, 8), null, 2));
