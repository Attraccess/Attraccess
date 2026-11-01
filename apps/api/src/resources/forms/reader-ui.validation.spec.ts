import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { validateReaderUiCapabilities, validateSlotUpdate } from './reader-ui.validation';
import { makeStringLVGLReady } from '../../attractap/websockets/websocket-lvgl';

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
