import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const requiredChecks = [
  'fresh-controller-commissioning',
  'baseline-hardening',
  'permanent-enrollment-and-revocation',
  'visual-digital-io-and-modbus',
  'publish-applied-and-hardware-ready',
  'input-measurement-flow-and-acknowledged-output',
  'independent-packed-bits-and-concurrent-outputs',
  'restart-reconnect-and-reboot',
  'rejection-and-rollback',
  'expired-and-duplicate-commands',
  'disconnect-pulse-and-selected-input-guards',
  'interrupted-commissioning-and-credential-recovery',
  'removed-controller-reenrollment',
  'modbus-failure-and-stale-wait',
  'desktop-and-mobile',
  'simulator-and-runtime-conformance',
  'audit-lifecycle-and-redaction',
];

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Checks evidence completeness only. It never contacts a controller or certifies evidence authenticity. */
export function checkWagoAcceptance(evidence) {
  if (!record(evidence)) return ['Evidence must be a JSON object.'];
  const errors = [];
  if (evidence.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (evidence.environment !== 'physical') errors.push('Physical hardware evidence is required; simulation is not acceptance.');
  if (evidence.controller?.model !== '751-9301' || evidence.controller?.firmware !== '31') {
    errors.push('Record the supported CC100 751-9301 / firmware 31 baseline.');
  }
  for (const key of ['hardwareId', 'startingState', 'wiringEvidence']) {
    if (!text(evidence.controller?.[key])) errors.push(`controller.${key} is required.`);
  }
  for (const key of ['pluginCommit', 'runtimeCommit']) {
    if (typeof evidence.build?.[key] !== 'string' || !/^[a-f0-9]{40}$/.test(evidence.build[key])) errors.push(`build.${key} must be a full commit SHA.`);
  }
  for (const key of ['frontendDigest', 'backendDigest', 'runtimeDigest']) {
    if (typeof evidence.build?.[key] !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(evidence.build[key])) errors.push(`build.${key} must be a SHA-256 digest.`);
  }
  for (const key of ['protocolVersion', 'signedBundleEvidence', 'visualArtifactProvisioningEvidence']) {
    if (!text(evidence.build?.[key])) errors.push(`build.${key} is required.`);
  }
  for (const key of ['model', 'transport', 'profileVersion', 'qualificationEvidence']) {
    if (!text(evidence.modbus?.[key])) errors.push(`modbus.${key} is required; no unqualified support claims.`);
  }
  if (!text(evidence.participant?.id) || !text(evidence.implementerId)) errors.push('Participant and implementer identifiers are required.');
  if (text(evidence.participant?.id) && text(evidence.implementerId) &&
      evidence.participant.id.trim().toLowerCase() === evidence.implementerId.trim().toLowerCase()) {
    errors.push('The acceptance participant must not be the implementer.');
  }
  if (!['nontechnical', 'lightly-technical'].includes(evidence.participant?.experience)) {
    errors.push('Record a nontechnical or lightly technical participant.');
  }
  if (evidence.noCodeJourney !== true || evidence.developerIntervention !== false) {
    errors.push('The journey must require no terminal, code, JSON, API client, manual secret copying or developer intervention.');
  }
  if (evidence.safeFixtureConfirmed !== true) errors.push('Confirm qualified wiring, low-voltage fixtures and independent safety circuits.');
  if (!Array.isArray(evidence.blockers) || evidence.blockers.length) errors.push('blockers must be an explicitly empty array.');
  if (!Array.isArray(evidence.obstacles)) errors.push('Record participant obstacles, including an empty array if none.');
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  if (checks.some((check) => !record(check) || !requiredChecks.includes(check.id))) errors.push('checks contains an unknown or malformed entry.');
  for (const id of requiredChecks) {
    const matches = checks.filter((check) => check?.id === id);
    if (matches.length !== 1) {
      errors.push(`${id}: exactly one evidence entry is required.`);
      continue;
    }
    const check = matches[0];
    if (check.result !== 'pass') errors.push(`${id}: required check did not pass.`);
    if (!text(check.observed) || !text(check.evidenceRef) || !text(check.recordedAt) || !validTimestamp(check.recordedAt)) {
      errors.push(`${id}: observed result, evidence reference and recording timestamp are required.`);
    }
  }
  return errors;
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || Number(match[4] ?? 0) > 23 || Number(match[5] ?? 0) > 59) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  const offset = match[2] === 'Z' ? 0 : (match[3] === '+' ? 1 : -1) * (Number(match[4]) * 60 + Number(match[5])) * 60_000;
  return new Date(time + offset).toISOString().slice(0, 19) === match[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/check-wago-acceptance.mjs <evidence.json>');
    const errors = checkWagoAcceptance(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    if (errors.length) {
      console.error(['WAGO evidence incomplete:', ...errors.map((error) => `- ${error}`)].join('\n'));
      process.exitCode = 1;
    } else {
      console.log('Evidence fields complete. Human review of linked hardware/user/audit evidence is still required. No release was published.');
    }
  } catch {
    console.error('Could not validate evidence. Supply one readable JSON file: node scripts/check-wago-acceptance.mjs <evidence.json>');
    process.exitCode = 1;
  }
}
