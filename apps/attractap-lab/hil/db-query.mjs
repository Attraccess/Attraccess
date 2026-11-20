#!/usr/bin/env node
// SQL access to the run's throwaway PostgreSQL database for the Python lab tests.
//
// Reads {"sql": "...", "params": [...]} from stdin (`?` placeholders, camelCase identifiers quoted) and prints
// {"rows": [[...], ...], "columns": [...], "changes": n} on stdout. bytea values come back as {"$bytes": "<base64>"}.
// The database is DATABASE_URL, like the seed script (apps/api/scripts/seed-dev-user.mjs).
import { postgresProvider, toPositionalParameters } from '../../api/scripts/lib/database-provider.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { sql, params = [] } = JSON.parse(Buffer.concat(chunks).toString('utf8'));

const db = await postgresProvider.open(postgresProvider.defaultLocation(process.env));
try {
  const result = await db.query({ text: toPositionalParameters(sql), values: params, rowMode: 'array' });
  const rows = (result.rows ?? []).map((row) =>
    row.map((value) => (Buffer.isBuffer(value) ? { $bytes: value.toString('base64') } : value)),
  );
  process.stdout.write(
    JSON.stringify({ rows, columns: (result.fields ?? []).map((field) => field.name), changes: result.rowCount ?? 0 }),
  );
} finally {
  await postgresProvider.close(db);
}
