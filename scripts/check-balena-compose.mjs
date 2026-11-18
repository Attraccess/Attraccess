#!/usr/bin/env node
// Validate docker-compose.balena.yml with balena's OWN parser (@balena/compose-parser,
// the exact code `balena push` runs). Catches balena-only constraints — e.g. long-form
// `depends_on: { condition: ... }` and top-level secrets/configs — that a normal compose
// engine accepts but balena rejects only at release time, after all other CI is green.
import { readFileSync } from 'node:fs';
import { parse } from '@balena/compose-parser';

const file = process.argv[2] ?? 'docker-compose.balena.yml';

try {
  // Our own file, read like `balena push` reads it on the pushing machine: env_file is followed. Since v1.0.0 the
  // parser only does that when asked to trust the file.
  await parse(file, { hostEnvironment: true });
  // Rules the parser cannot see: balena does not interpolate ${VAR:-default} (ATT-593), and the stack must carry its
  // own PostgreSQL and backup sidecar instead of the retired Duplicati.
  const source = readFileSync(file, 'utf8');
  const code = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
  const problems = [];
  if (/\$\{[^}]*:-/.test(code)) problems.push('uses ${VAR:-default} interpolation, which balena does not support');
  if (/^ {2}duplicati:/m.test(code)) problems.push('still defines the retired duplicati service');
  for (const service of ['postgres', 'backup']) {
    if (!new RegExp(`^ {2}${service}:`, 'm').test(code)) problems.push(`has no ${service} service`);
  }
  if (!/^ {2}attraccess:[\s\S]*?depends_on:\s*\n\s+- postgres/m.test(code)) {
    problems.push('the attraccess service must depend on postgres (short form)');
  }
  if (problems.length) throw new Error(problems.join('\n  '));
  console.log(`✓ ${file} is balena-compatible`);
} catch (err) {
  console.error(`✗ ${file} is not balena-compatible:\n  ${err.message}`);
  process.exit(1);
}
