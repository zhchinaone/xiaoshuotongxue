import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFeishuService } from "../functions/_shared/site.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply")) {
  throw new Error("Usage: node scripts/migrate-seo.mjs [--apply]");
}
const apply = args.includes("--apply");
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const service = createFeishuService(process.env, new Request("http://localhost/"));
if (!service.isConfigured()) throw new Error("Feishu credentials are required");
const schema = await service.discoverSchema();
const tables = await service.listTables();
// Snapshot every table, including unpublished records and fields not owned by the website.
const snapshot = [];
for (const table of tables) {
  snapshot.push({ ...table, records: await service.listRecords(table.table_id) });
}
const works = snapshot.find((table) => table.table_id === schema.worksTableId)?.records || [];
const keyField = schema.worksFields.caseKey;
const updates = [];
const keys = new Set();
for (const record of works) {
  const storedKey = record.fields[keyField];
  const key = typeof storedKey === "string" && storedKey.trim() ? storedKey : record.record_id;
  if (keys.has(key)) throw new Error(`Duplicate caseKey: ${key}; migration aborted`);
  keys.add(key);
  if (key !== storedKey) updates.push({ record_id: record.record_id, fields: { [keyField]: key } });
}

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupPath = resolve(root, "backups", `seo-migration-${timestamp}.json`);
await mkdir(dirname(backupPath), { recursive: true });
await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), tables: snapshot }, null, 2),
  { encoding: "utf8", flag: "wx" });
console.log(`Backup: ${backupPath}`);
console.log(`${apply ? "APPLY" : "DRY RUN"}: ensure SEO schema; seed ${updates.length} missing caseKey values.`);
if (apply) {
  const ensured = await service.ensureSchema();
  await service.updateTableRecords(ensured.worksTableId, updates);
  console.log("Migration complete. Only schema and missing caseKey values were changed.");
} else {
  console.log("No Feishu writes performed. Pass --apply to apply this migration.");
}
