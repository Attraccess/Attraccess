// Post-export BOM validator checks PN present and matches ref-class subcategory
// FEATURE: hardware/export — block fab orders with missing or wrong-class PNs

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REF_CLASS = [
  { prefix: 'LS', pattern: /buzzer|speaker|audio/i, label: 'buzzer' },
  { prefix: 'LED', pattern: /\bled\b|light.?emitting/i, label: 'LED' },
  { prefix: 'SW', pattern: /switch|tactile|key/i, label: 'switch' },
  { prefix: 'Y', pattern: /crystal|oscillator|resonator/i, label: 'crystal/oscillator' },
  { prefix: 'Q', pattern: /mosfet|bjt|transistor|jfet|igbt|thyristor/i, label: 'transistor' },
  { prefix: 'D', pattern: /diode|rectifier|tvs|zener|schottky/i, label: 'diode' },
  { prefix: 'U', pattern: /\bic\b|integrated|microcontroller|regulator|op.?amp|driver|converter|sensor|memory|logic/i, label: 'IC' },
  { prefix: 'J', pattern: /connector|terminal|header|jack|socket|receptacle|wire.?to.?board/i, label: 'connector' },
  { prefix: 'R', pattern: /resistor/i, label: 'resistor' },
  { prefix: 'C', pattern: /capacitor/i, label: 'capacitor' },
  { prefix: 'L', pattern: /inductor|ferrite|bead/i, label: 'inductor' },
];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLASSES_PATH = resolve(SCRIPT_DIR, 'lcsc-classes.json');

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

function classifyRef(designator) {
  const ref = designator.split(/\s*,\s*/)[0].toUpperCase();
  const match = ref.match(/^([A-Z]+)\d*/);
  if (!match) return null;
  return REF_CLASS.find((c) => c.prefix === match[1]) ?? null;
}

function loadClasses() {
  const raw = JSON.parse(readFileSync(CLASSES_PATH, 'utf8'));
  delete raw._meta;
  return raw;
}

function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    process.stderr.write('usage: validate-bom.mjs <gerbers-zip>\n');
    process.exit(2);
  }
  const rows = parseCsv(readBomFromZip(zipPath));
  const missing = rows.filter((r) => !r['JLCPCB Part #']);
  if (missing.length > 0) {
    process.stderr.write(
      `BOM validator: ${missing.length} row(s) missing JLCPCB Part #: ${missing.map((r) => r.Designator).join(', ')}\n`,
    );
    process.exit(1);
  }
  const classes = loadClasses();
  const unknown = [];
  const mismatches = [];
  for (const row of rows) {
    const pn = row['JLCPCB Part #'];
    const designator = row.Designator ?? '';
    const expected = classifyRef(designator);
    if (!expected) continue;
    const entry = classes[pn];
    if (!entry) {
      unknown.push(`${designator} (${pn}) — not in lcsc-classes.json; run \`pnpm pcbparts:jlc_get_part ${pn}\` and add it`);
      continue;
    }
    const haystack = `${entry.category} ${entry.subcategory} ${entry.model}`;
    if (!expected.pattern.test(haystack)) {
      mismatches.push(
        `${designator} (${pn}) — expected ${expected.label}, lcsc-classes.json says "${entry.subcategory || entry.category}" (${entry.model})`,
      );
    }
  }
  if (unknown.length > 0 || mismatches.length > 0) {
    if (unknown.length > 0) {
      process.stderr.write(`BOM validator: ${unknown.length} PN(s) missing from lcsc-classes.json:\n  ${unknown.join('\n  ')}\n`);
    }
    if (mismatches.length > 0) {
      process.stderr.write(`BOM validator: ${mismatches.length} component-class mismatch(es):\n  ${mismatches.join('\n  ')}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`BOM OK: ${rows.length} designators — PNs present, classes match\n`);
}

main();
