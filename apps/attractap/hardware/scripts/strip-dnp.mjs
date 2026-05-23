// Strip hand-populated designators from gerber zip BOM and pick-and-place files
// FEATURE: hardware/export — exclude DNP-by-prefix rows from JLC PCBA matcher input

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = resolve(SCRIPT_DIR, 'validate-bom.mjs');

const STRIP_CSV_NAMES = ['bom.csv', 'pick_and_place.csv'];

function loadDnpPrefixes() {
  const src = readFileSync(VALIDATOR_PATH, 'utf8');
  const match = src.match(/const REF_CLASS = \[([\s\S]*?)\];/);
  if (!match) throw new Error('REF_CLASS not found in validate-bom.mjs');
  const prefixes = [];
  for (const row of match[1].matchAll(/prefix:\s*'([A-Z]+)'[^}]*allowMissingPn:\s*true/g)) {
    prefixes.push(row[1]);
  }
  if (prefixes.length === 0) throw new Error('no DNP prefixes found (allowMissingPn:true) in REF_CLASS');
  return prefixes;
}

function refPrefixOf(designator) {
  return designator.replace(/^"|"$/g, '').trim().toUpperCase().match(/^([A-Z]+)/)?.[1] ?? '';
}

function filterCsv(csv, dnpPrefixes) {
  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  const header = lines[0];
  const designatorIdx = header.split(',').findIndex((h) => h.trim().toLowerCase() === 'designator');
  if (designatorIdx < 0) throw new Error(`Designator column missing from CSV header: ${header}`);
  const kept = [];
  let dropped = 0;
  for (const line of lines.slice(1)) {
    const prefix = refPrefixOf(line.split(',')[designatorIdx] ?? '');
    if (dnpPrefixes.includes(prefix)) {
      dropped += 1;
      continue;
    }
    kept.push(line);
  }
  return { csv: [header, ...kept].join('\n') + '\n', dropped };
}

function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    process.stderr.write('usage: strip-dnp.mjs <gerbers-zip>\n');
    process.exit(2);
  }
  const absZip = resolve(zipPath);
  const dnpPrefixes = loadDnpPrefixes();
  const work = mkdtempSync(join(tmpdir(), 'strip-dnp-'));
  try {
    execFileSync('unzip', ['-q', '-o', absZip, ...STRIP_CSV_NAMES, '-d', work], { stdio: ['ignore', 'ignore', 'pipe'] });
    const droppedByFile = [];
    for (const csvName of STRIP_CSV_NAMES) {
      const path = join(work, csvName);
      const { csv, dropped } = filterCsv(readFileSync(path, 'utf8'), dnpPrefixes);
      writeFileSync(path, csv);
      droppedByFile.push(`${csvName}=${dropped}`);
    }
    execFileSync('zip', ['-q', '-j', absZip, ...STRIP_CSV_NAMES.map((n) => join(work, n))]);
    process.stdout.write(`strip-dnp: prefixes=[${dnpPrefixes.join(',')}] dropped=${droppedByFile.join(' ')}\n`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
