// Refreshes trust/dcl-seed.json: the snapshot of production PAA roots and CD signing certificates the sidecar seeds its
// attestation trust store with (apps/matter-sidecar/src/commissioning/trust.ts). It fetches from the CSA production DCL and
// keeps production entries only. The file is a published data file, committed by hand; run this script and commit the
// result before every Matter release (see docs/en/plugins/matter/operator.md). Usage:
//   node apps/matter-sidecar/scripts/refresh-dcl-seed.mjs [--url <dcl base url>] [--allow-other-host] [--out <file>]
//
// What it trusts: PAA roots that are on the DCL's approved root list (/dcl/pki/root-certificates) and are device
// attestation certificates; CD signers that are device attestation certificates of the CSA (vid 0xC5A0), issued by an
// approved root. It talks to the DCL over HTTPS only, and to the production DCL host unless --allow-other-host is given
// (a mirror; the test DCL must never be used, its roots are test roots).
import { X509Certificate } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const USAGE =
  'Usage: node apps/matter-sidecar/scripts/refresh-dcl-seed.mjs [--url <dcl base url>] [--allow-other-host] [--out <file>]';
const FLAGS = new Set(['--url', '--out', '--allow-other-host']);
// An unknown flag (--help included) must never fall through to a run: the default output is the committed seed.
if (args.some((arg) => arg.startsWith('-') && !FLAGS.has(arg))) {
  const asked = args.includes('--help') || args.includes('-h');
  process.stdout.write(`${USAGE}\n`);
  process.exit(asked ? 0 : 2);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const PRODUCTION_HOST = 'on.dcl.csa-iot.org';
const base = option('--url', `https://${PRODUCTION_HOST}`).replace(/\/$/, '');
const out = resolve(option('--out', resolve(here, '../trust/dcl-seed.json')));
const CD_SIGNER = /Certification Declaration Signing Key/i;
/** The CSA's vendor ID. Only the CSA signs Certification Declarations. */
const CSA_VID = /(^|,)\s*vid=0xC5A0\s*(,|$)/i;
const DEVICE_ATTESTATION = 'DeviceAttestationPKI';

const baseUrl = new URL(base);
if (baseUrl.protocol !== 'https:') {
  process.stderr.write(`Refusing ${baseUrl.protocol} — the DCL is only fetched over HTTPS.\n`);
  process.exit(2);
}
if (baseUrl.hostname !== PRODUCTION_HOST && !args.includes('--allow-other-host')) {
  process.stderr.write(
    `Refusing ${baseUrl.hostname}: only the production DCL (${PRODUCTION_HOST}) is used unless --allow-other-host is given.\n`,
  );
  process.exit(2);
}

async function fetchJson(path, params = {}) {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`DCL answered ${response.status} for ${url.pathname}`);
  return response.json();
}

const normalizedKeyId = (keyId) =>
  String(keyId ?? '')
    .replace(/:/g, '')
    .toUpperCase();

/** The subject key IDs of the roots the DCL lists as approved. */
async function approvedRootKeyIds() {
  const body = await fetchJson('/dcl/pki/root-certificates');
  const certs = body.approvedRootCertificates?.certs ?? [];
  return new Set(certs.map((cert) => normalizedKeyId(cert.subjectKeyId)).filter(Boolean));
}

function fetchPage(nextKey) {
  return fetchJson('/dcl/pki/all-certificates', {
    'pagination.limit': '1000',
    ...(nextKey ? { 'pagination.key': nextKey } : {}),
  });
}

/** True when `record`'s certificate is issued and signed by one of `roots` (X509Certificate by subject key ID). */
function issuedByOneOf(record, roots) {
  const root = roots.get(normalizedKeyId(record.rootSubjectKeyId));
  if (!root) return false;
  const cert = new X509Certificate(record.pemCert);
  return cert.checkIssued(root) && cert.verify(root.publicKey);
}

function entryOf(record) {
  const der = new X509Certificate(record.pemCert);
  return {
    subjectKeyId: normalizedKeyId(record.subjectKeyId),
    subjectAsText: record.subjectAsText ?? null,
    derHex: der.raw.toString('hex'),
    kind: 'production',
    notBefore: new Date(der.validFrom).toISOString(),
    notAfter: new Date(der.validTo).toISOString(),
  };
}

const approved = await approvedRootKeyIds();
const records = [];
let next;
do {
  const page = await fetchPage(next);
  for (const group of page.certificates ?? []) records.push(...(group.certs ?? []));
  next = page.pagination?.next_key ?? undefined;
} while (next);

const attestation = records.filter((record) => record.certificateType === DEVICE_ATTESTATION);
// A root counts only when the approved root list names it too.
const roots = attestation.filter((record) => record.isRoot && approved.has(normalizedKeyId(record.subjectKeyId)));
const unapproved = attestation.filter((record) => record.isRoot).length - roots.length;
if (unapproved > 0) process.stderr.write(`Skipped ${unapproved} root(s) missing from the approved root list.\n`);
const rootCerts = new Map(
  roots.map((record) => [normalizedKeyId(record.subjectKeyId), new X509Certificate(record.pemCert)]),
);
const paaRoots = roots.map(entryOf);
const cdSigners = attestation
  .filter(
    (record) =>
      !record.isRoot &&
      CD_SIGNER.test(record.subjectAsText ?? '') &&
      CSA_VID.test(record.subjectAsText ?? '') &&
      issuedByOneOf(record, rootCerts),
  )
  .map(entryOf);
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
