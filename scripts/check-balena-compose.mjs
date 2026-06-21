#!/usr/bin/env node
// Validate docker-compose.balena.yml with balena's OWN parser (@balena/compose-parser,
// the exact code `balena push` runs). Catches balena-only constraints — e.g. long-form
// `depends_on: { condition: ... }` and top-level secrets/configs — that a normal compose
// engine accepts but balena rejects only at release time, after all other CI is green.
import { parse } from '@balena/compose-parser';

const file = process.argv[2] ?? 'docker-compose.balena.yml';

try {
  await parse(file);
  console.log(`✓ ${file} is balena-compatible`);
} catch (err) {
  console.error(`✗ ${file} is not balena-compatible:\n  ${err.message}`);
  process.exit(1);
}
