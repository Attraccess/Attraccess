import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  isCoreStatusString,
  validatePluginConfirmation,
  validateReaderUiCapabilities,
  validateSlotUpdate,
  validateStepRequest,
} from './reader-ui.validation';
import { makeStringLVGLReady } from '../../common/text/latin1';

const FIXTURE_DIR = join(__dirname, '../../../../../apps/attractap/firmware/tests/ui-fixtures');

interface Fixture {
  name: string;
  kind: 'slot-update' | 'capabilities';
  verdict: string;
  payload: unknown;
}

const fixtures: Fixture[] = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as Fixture);

describe('reader UI validation fixtures', () => {
  it('loads the shared fixture folder', () => {
    expect(fixtures.length).toBeGreaterThan(20);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))('gives the expected verdict for %s', (_name, fixture) => {
    if (fixture.kind === 'capabilities') {
      const caps = validateReaderUiCapabilities(fixture.payload);
      expect(caps !== null ? 'accept' : 'reject:invalid-shape').toBe(fixture.verdict);
      return;
    }
    const result = validateSlotUpdate(fixture.payload);
    const verdict = result.ok ? 'accept' : `reject:${result.reason}`;
    expect(verdict).toBe(fixture.verdict);
  });
});

describe('Latin-1 sanitising before counting', () => {
  it.each([
    ['ł', 'l'],
    ['Ž', 'Z'],
    ['‘a’', "'a'"],
    ['“a”', '"a"'],
    ['a‐b‑c‒d–e—f―g', 'a-b-c-d-e-f-g'],
    ['wait…', 'wait...'],
    ['14:00 - 16:00', '14:00 - 16:00'],
    ['10 Uhr', '10 Uhr'],
    ['你', '?'],
  ])('%j becomes %j', (input, expected) => {
    expect(makeStringLVGLReady(input)).toBe(expected);
  });

  it('covers Intl.DateTimeFormat output for en and de', () => {
    const date = new Date(Date.UTC(2026, 10, 1, 14, 5));
    for (const locale of ['en', 'de']) {
      const text = new Intl.DateTimeFormat(locale, { timeStyle: 'short', dateStyle: 'medium', timeZone: 'UTC' }).format(
        date,
      );
      expect(makeStringLVGLReady(text)).toMatch(/^[\x20-\x7E\xA0-\xFF]*$/);
    }
  });

  it('counts the sanitized text against the limits', () => {
    const ellipsis = '…'.repeat(30);
    const result = validateSlotUpdate({
      resourceId: 1,
      slot: 'resource.details.body',
      revision: 1,
      owner: 'p',
      key: 'k',
      serverNowMs: 1,
      tree: { t: 'text', text: ellipsis },
    });
    expect(result).toEqual({ ok: false, reason: 'text-too-long' });
  });
});

describe('core status spoofing', () => {
  const slotText = (text: string) =>
    validateSlotUpdate({
      resourceId: 1,
      slot: 'resource.details.body',
      revision: 1,
      owner: 'p',
      key: 'k',
      serverNowMs: 1,
      tree: { t: 'text', text },
    });

  it.each([
    'Access granted',
    'Access granted ✓',
    '✓ Access granted',
    'ACCESS GRANTED!',
    '  in   use  ',
    'In use (A)',
    'In use by Anna',
    'Maintenance.',
    '*** Wartung ***',
    'Zugriff gewährt',
  ])('rejects %j', (text) => {
    expect(slotText(text)).toEqual({ ok: false, reason: 'core-string-spoof' });
  });

  it.each(['Free until 14:00', 'Reserved 14:00', 'Useful tip', 'Inuse', 'Booked until 16:00'])('accepts %j', (text) => {
    expect(isCoreStatusString(text)).toBe(false);
    expect(slotText(text).ok).toBe(true);
  });
});

describe('validateStepRequest', () => {
  const base = (extra: Record<string, unknown> = {}) => ({
    requestId: 0,
    stepId: 'k3J9vQ2mXc8LrT0aW5yZbQ',
    kind: 'choose',
    resourceId: 1,
    serverNowMs: 1,
    expiresAtMs: 2,
    title: 'Free the rest?',
    body: 'Release your booking',
    choices: [
      { id: 'keep', label: 'Keep' },
      { id: 'free', label: 'Free' },
    ],
    ...extra,
  });

  it('accepts a valid question', () => {
    expect(validateStepRequest(base()).ok).toBe(true);
  });

  it.each([
    ['label-too-long', { choices: [{ id: 'keep', label: 'x'.repeat(32) }] }],
    ['bad-id', { choices: [{ id: 'Not Valid', label: 'Keep' }] }],
    ['too-many-choices', { choices: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, label: id })) }],
    ['too-many-choices', { choices: [] }],
    ['core-string-spoof', { choices: [{ id: 'keep', label: 'Access granted' }] }],
    ['core-string-spoof', { title: 'In use' }],
    ['text-too-long', { title: 'x'.repeat(81) }],
    ['invalid-shape', { kind: 'confirm', choices: [{ id: 'a', label: 'A' }] }],
  ])('rejects with %s', (reason, extra) => {
    expect(validateStepRequest(base(extra))).toEqual({ ok: false, reason });
  });

  it('rejects a spoofing action label', () => {
    const step = base({ kind: 'confirm', choices: undefined, actions: [{ id: 'ok', role: 'ok', label: 'Maintenance' }] });
    expect(validateStepRequest(step)).toEqual({ ok: false, reason: 'core-string-spoof' });
  });
});

describe('validatePluginConfirmation (shared with the step check)', () => {
  const confirmation = (extra: Record<string, unknown> = {}) => ({
    stepKey: 'res-conflict',
    title: 'Reserved from 14:00',
    body: 'Start anyway?',
    ...extra,
  });

  it('accepts a minimal confirmation and fills the default expiry', () => {
    expect(validatePluginConfirmation(confirmation())).toEqual({
      ok: true,
      value: { ...confirmation(), expiresInSec: 60 },
    });
  });

  it.each([
    [{ expiresInSec: 1 }, 10],
    [{ expiresInSec: 500 }, 120],
    [{ expiresInSec: 30.5 }, 30.5],
  ])('clamps %j', (extra, expected) => {
    const result = validatePluginConfirmation(confirmation(extra));
    expect(result.ok && result.value.expiresInSec).toBe(expected);
  });

  it.each([
    ['bad-enum', { tone: 'neon' }],
    ['bad-enum', { noScreenPolicy: 'never' }],
    ['invalid-shape', { expiresInSec: Number.NaN }],
    ['invalid-shape', { expiresInSec: '30' }],
    ['invalid-shape', { countdownTo: new Date(Number.NaN) }],
    ['invalid-shape', { countdownTo: 12345 }],
    ['bad-id', { stepKey: 'UPPER' }],
    ['label-too-long', { confirmLabel: 'x'.repeat(32) }],
    ['core-string-spoof', { cancelLabel: 'Available' }],
    ['core-string-spoof', { title: 'Access granted ✓' }],
  ])('rejects with %s for %j', (reason, extra) => {
    expect(validatePluginConfirmation(confirmation(extra))).toEqual({ ok: false, reason });
  });
});
