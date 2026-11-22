// Refreshes trust/dcl-seed.json: the snapshot of production PAA roots and CD signing certificates the sidecar seeds its
// attestation trust store with (apps/matter-sidecar/src/commissioning/trust.ts). It fetches from the CSA production DCL and
// keeps production entries only. The file is a published data file, committed by hand; run this script and commit the
// result before every Matter release (see docs/en/plugins/matter/operator.md). Usage:
//   node apps/matter-sidecar/scripts/refresh-dcl-seed.mjs [--url <dcl base url>] [--out <file>]
import { X509Certificate } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const USAGE = 'Usage: node apps/matter-sidecar/scripts/refresh-dcl-seed.mjs [--url <dcl base url>] [--out <file>]';
// An unknown flag (--help included) must never fall through to a run: the default output is the committed seed.
if (args.some((arg) => arg.startsWith('-') && arg !== '--url' && arg !== '--out')) {
  const asked = args.includes('--help') || args.includes('-h');
  process.stdout.write(`${USAGE}\n`);
  process.exit(asked ? 0 : 2);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const base = option('--url', 'https://on.dcl.csa-iot.org').replace(/\/$/, '');
const out = resolve(option('--out', resolve(here, '../trust/dcl-seed.json')));
const CD_SIGNER = /Certification Declaration Signing Key/i;

async function fetchPage(nextKey) {
  const url = new URL(`${base}/dcl/pki/all-certificates`);
  url.searchParams.set('pagination.limit', '1000');
  if (nextKey) url.searchParams.set('pagination.key', nextKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`DCL answered ${response.status} for ${url.pathname}`);
  return response.json();
}

function entryOf(record) {
  const der = new X509Certificate(record.pemCert);
  return {
    subjectKeyId: record.subjectKeyId.replace(/:/g, '').toUpperCase(),
    subjectAsText: record.subjectAsText ?? null,
    derHex: der.raw.toString('hex'),
    kind: 'production',
    notBefore: new Date(der.validFrom).toISOString(),
    notAfter: new Date(der.validTo).toISOString(),
  };
}

const records = [];
let next;
do {
  const page = await fetchPage(next);
  for (const group of page.certificates ?? []) records.push(...(group.certs ?? []));
  next = page.pagination?.next_key ?? undefined;
} while (next);

const paaRoots = records.filter((record) => record.isRoot).map(entryOf);
const cdSigners = records.filter((record) => !record.isRoot && CD_SIGNER.test(record.subjectAsText ?? '')).map(entryOf);
const byKey = (a, b) => a.subjectKeyId.localeCompare(b.subjectKeyId);
if (paaRoots.length === 0 || cdSigners.length === 0) {
  throw new Error(`Refusing to write an empty seed (PAA ${paaRoots.length}, CD signers ${cdSigners.length}).`);
}
const seed = {
  builtAt: new Date().toISOString(),
  source: `${base}/dcl/pki/all-certificates`,
  paaRoots: paaRoots.sort(byKey),
  cdSigners: cdSigners.sort(byKey),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(seed, null, 2)}\n`);
process.stdout.write(`Wrote ${paaRoots.length} PAA roots and ${cdSigners.length} CD signers to ${out}\n`);
