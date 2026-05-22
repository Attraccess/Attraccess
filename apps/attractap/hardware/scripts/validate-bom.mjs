// Post-export BOM validator asserts JLCPCB Part number column populated each row
// FEATURE: hardware/export — block fab orders missing supplier PNs

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function readBomFromZip(zipPath) {
  return execFileSync('unzip', ['-p', resolve(zipPath), 'bom.csv'], { encoding: 'utf8' });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const fields = line.split(',').map((s) => s.trim());
    return Object.fromEntries(header.map((h, i) => [h, fields[i] ?? '']));
  });
}

function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    process.stderr.write('usage: validate-bom.mjs <gerbers-zip>\n');
    process.exit(2);
  }
  const csv = readBomFromZip(zipPath);
  const rows = parseCsv(csv);
  const missing = rows.filter((r) => !r['JLCPCB Part #']);
  if (missing.length > 0) {
    process.stderr.write(
      `BOM validator: ${missing.length} row(s) missing JLCPCB Part #: ${missing
        .map((r) => r.Designator)
        .join(', ')}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`BOM OK: ${rows.length} designators all carry a JLCPCB Part #\n`);
}

main();
