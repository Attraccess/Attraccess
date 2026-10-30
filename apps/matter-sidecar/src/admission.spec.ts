import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { checkAdmission, versionedRefusal } from './admission';
import { SIMULATED_MATTER_VERSION, validHeaders } from './testing/harness';

const running = { sidecar: COMPATIBILITY_TABLE[0].sidecar, matterJs: SIMULATED_MATTER_VERSION };
const headers = (overrides: Record<string, string | undefined> = {}) => validHeaders(overrides);

describe('checkAdmission', () => {
  it('admits the supported combination, including Attraccess prereleases', () => {
    expect(checkAdmission(headers(), running)).toEqual({ ok: true });
    expect(checkAdmission(headers({ 'x-attraccess-version': '1.12.0-rc.1' }), running)).toEqual({ ok: true });
  });

  it.each([[undefined], ['abc'], ['2'], ['0'], ['1.0']])('rejects wire version %p with 426 semantics', (wire) => {
    const result = checkAdmission(headers({ 'x-matter-wire-version': wire }), running);
    expect(result).toMatchObject({ ok: false, code: 'unsupported_wire_version', details: { supportedWireVersion: 1 } });
  });

  it.each([
    ['attraccess too old', { 'x-attraccess-version': '1.10.0' }],
    ['attraccess next major', { 'x-attraccess-version': '2.0.0' }],
    ['plugin mismatch', { 'x-matter-plugin-version': '9.9.9' }],
    ['sidecar mismatch', { 'x-matter-sidecar-version': '9.9.9' }],
    ['attraccess missing', { 'x-attraccess-version': undefined }],
    ['plugin missing', { 'x-matter-plugin-version': undefined }],
    ['sidecar missing', { 'x-matter-sidecar-version': undefined }],
  ])('rejects a single mismatched component: %s', (_name, overrides) => {
    const result = checkAdmission(headers(overrides), running);
    expect(result).toMatchObject({ ok: false, code: 'incompatible_release' });
    expect(JSON.stringify(result)).toContain('supported');
  });

  it('never echoes malformed values and reports them as problems', () => {
    const evil = '<script>alert(1)</script>';
    const result = checkAdmission(headers({ 'x-matter-plugin-version': evil }), running);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('script');
    expect(result).toMatchObject({ details: { received: { plugin: null }, problems: ['plugin:malformed'] } });
  });

  it('rejects every request when the running sidecar is not in the table', () => {
    expect(checkAdmission(headers(), { sidecar: '9.9.9', matterJs: SIMULATED_MATTER_VERSION })).toMatchObject({
      ok: false,
    });
    expect(checkAdmission(headers(), { sidecar: running.sidecar, matterJs: '0.0.1' })).toMatchObject({ ok: false });
  });

  it('treats array-valued (repeated) headers as malformed', () => {
    const repeated = {
      ...headers(),
      'x-matter-plugin-version': ['0.1.0-alpha.0', '0.1.0-alpha.0'] as unknown as string,
    };
    expect(checkAdmission(repeated, running)).toMatchObject({ ok: false, code: 'incompatible_release' });
  });
});

describe('versionedRefusal', () => {
  const draining = () => true;
  const open = () => false;

  it('admits a correctly versioned client while the sidecar is not draining', () => {
    expect(versionedRefusal(headers(), running, open)).toBeNull();
  });

  it('refuses every client with sidecar_unavailable while draining, before looking at its version', () => {
    expect(versionedRefusal(headers(), running, draining)).toMatchObject({ code: 'sidecar_unavailable' });
    expect(versionedRefusal(headers({ 'x-matter-wire-version': '2' }), running, draining)).toMatchObject({
      code: 'sidecar_unavailable',
    });
  });

  it('passes the admission refusal through unchanged when not draining', () => {
    expect(versionedRefusal(headers({ 'x-matter-wire-version': '2' }), running, open)).toMatchObject({
      code: 'unsupported_wire_version',
      details: { supportedWireVersion: 1 },
    });
    expect(versionedRefusal(headers({ 'x-matter-plugin-version': '9.9.9' }), running, open)).toMatchObject({
      code: 'incompatible_release',
    });
  });
});
