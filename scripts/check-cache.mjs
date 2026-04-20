import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const db = postgres(process.env.DATABASE_URL);

// Cache-Einträge für Kunden prüfen
const rows = await db`
  SELECT cache_key, LENGTH(value::text) as size, expires_at
  FROM cache_entries
  WHERE cache_key LIKE 'klassi:kunden%'
  LIMIT 10
`;
console.log("Kunden-Cache-Einträge:", rows);

// Alle Cache-Keys anzeigen
const allKeys = await db`
  SELECT cache_key, LENGTH(value::text) as size, expires_at
  FROM cache_entries
  ORDER BY cache_key
  LIMIT 30
`;
console.log("\nAlle Cache-Keys:");
for (const row of allKeys) {
  console.log(`  ${row.cache_key}: ${row.size} bytes, expires: ${row.expires_at}`);
}

await db.end({ timeout: 5 });
