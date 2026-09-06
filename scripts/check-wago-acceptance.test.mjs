import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkWagoAcceptance, requiredChecks } from './check-wago-acceptance.mjs';

// Synthetic fixtures test the validator, not a controller or a release claim.
const fixture = () => ({
  schemaVersion: 1,
  environment: 'physical',
  controller: { model: '751-9301', firmware: '31', hardwareId: 'fixture', startingState: 'fresh', wiringEvidence: 'fixture-ref' },
  build: {
    pluginCommit: 'a'.repeat(40), runtimeCommit: 'b'.repeat(40),
    frontendDigest: `sha256:${'c'.repeat(64)}`, backendDigest: `sha256:${'d'.repeat(64)}`, runtimeDigest: `sha256:${'e'.repeat(64)}`,
    protocolVersion: '1.0.0', signedBundleEvidence: 'fixture-ref', visualArtifactProvisioningEvidence: 'fixture-ref',
  },
  modbus: { model: 'fixture', transport: 'fixture', profileVersion: 'fixture', qualificationEvidence: 'fixture-ref' },
  participant: { id: 'participant', experience: 'nontechnical' },
  implementerId: 'implementer', noCodeJourney: true, developerIntervention: false, safeFixtureConfirmed: true,
  blockers: [], obstacles: [],
  checks: requiredChecks.map((id) => ({ id, result: 'pass', observed: 'synthetic fixture', evidenceRef: 'fixture-ref', recordedAt: '2026-09-05T00:00:00Z' })),
});

test('complete synthetic evidence is structurally valid, not hardware proof', () => {
  assert.deepEqual(checkWagoAcceptance(fixture()), []);
});

test('rejects malformed root without throwing', () => {
  for (const value of [null, [], true, 'pass']) assert.ok(checkWagoAcceptance(value).length);
});

test('rejects simulation, implementer participation, intervention and blockers', () => {
  for (const patch of [
    { environment: 'simulator' }, { participant: { id: ' IMPLEMENTER ', experience: 'nontechnical' } },
    { noCodeJourney: false }, { developerIntervention: true }, { blockers: ['credentials unbacked'] },
    { safeFixtureConfirmed: false }, { obstacles: undefined },
  ]) assert.ok(checkWagoAcceptance({ ...fixture(), ...patch }).length, JSON.stringify(patch));
});

test('every required check must pass with a recorded observation and evidence', () => {
  for (const id of requiredChecks) {
    for (const patch of [{ result: 'not-run' }, { result: 'fail' }, { observed: '' }, { evidenceRef: '' }, { recordedAt: 'invalid' }]) {
      const evidence = fixture();
      Object.assign(evidence.checks.find((check) => check.id === id), patch);
      assert.ok(checkWagoAcceptance(evidence).some((error) => error.startsWith(id)));
    }
  }
});

test('rejects omitted, duplicate and unknown checks', () => {
  const evidence = fixture();
  evidence.checks.pop();
  evidence.checks.push(evidence.checks[0], { id: 'invented' });
  assert.equal(checkWagoAcceptance(evidence).length, 3);
});

test('requires exact baseline, artifact digests and qualified Modbus evidence', () => {
  const evidence = fixture();
  evidence.controller.firmware = '21';
  evidence.build.runtimeDigest = 'latest';
  evidence.build.pluginCommit = 'short';
  evidence.modbus.qualificationEvidence = '';
  assert.equal(checkWagoAcceptance(evidence).length, 4);
});

test('does not coerce arrays or other JSON types into artifact identifiers', () => {
  for (const key of ['pluginCommit', 'runtimeCommit', 'frontendDigest', 'backendDigest', 'runtimeDigest']) {
    for (const wrongType of [[fixture().build[key]], null, {}, true, 123]) {
      const evidence = fixture();
      evidence.build[key] = wrongType;
      assert.ok(checkWagoAcceptance(evidence).some((error) => error.startsWith(`build.${key}`)));
    }
  }
});

test('requires calendar-valid timestamps with explicit time zones', () => {
  for (const recordedAt of ['0', '2026-02-30', '2026-02-30T12:00:00Z', '2026-02-29T12:00:00Z', '2026-09-06T24:00:00Z', '2026-09-06T12:00:00', '2026-09-06T12:00:00+24:00']) {
    const evidence = fixture();
    evidence.checks[0].recordedAt = recordedAt;
    assert.ok(checkWagoAcceptance(evidence).length, recordedAt);
  }
  for (const recordedAt of ['2024-02-29T12:00:00Z', '2026-09-06T12:00:00.123+02:00']) {
    const evidence = fixture();
    evidence.checks[0].recordedAt = recordedAt;
    assert.deepEqual(checkWagoAcceptance(evidence), []);
  }
});
