import { BadRequestException, ConflictException } from '@nestjs/common';
import { ADMIN, DIGESTS, createConversionHarness, type HarnessOptions } from './secure-conversion.test-fixture';

async function online(options: HarnessOptions = {}) {
  const h = createConversionHarness(options);
  await h.connect();
  return h;
}

describe('secure conversion gates (server side)', () => {
  it('is eligible with every gate met', async () => {
    const h = await online();
    await expect(h.service.eligibility(1)).resolves.toEqual({ hidden: false, blockers: [] });
  });

  it('tells a reader manager without the permission only whether the action exists', async () => {
    const h = await online({ keysStatus: 'recovery-check-pending' });
    await expect(h.service.eligibilityFor(1, false)).resolves.toEqual({
      hidden: false,
      blockers: ['missing-permission'],
    });
    await expect(h.service.eligibilityFor(1, true)).resolves.toEqual({
      hidden: false,
      blockers: ['recovery-check-missing'],
    });
    const hidden = await online({ hardwareTested: false });
    await expect(hidden.service.eligibilityFor(1, false)).resolves.toEqual({
      hidden: true,
      blockers: ['missing-permission'],
    });
  });

  it('rejects preflight and start without a passed recovery check', async () => {
    const h = await online({ keysStatus: 'recovery-check-pending' });
    expect((await h.service.eligibility(1)).blockers).toEqual(['recovery-check-missing']);
    await expect(h.service.preflight(1, ADMIN)).rejects.toThrow('recovery key check');
    await expect(h.service.start(1, 'Lab door', ADMIN)).rejects.toThrow('recovery key check');
    expect(h.conversions.rows).toEqual([]);
    expect(h.sentToReader()).toEqual([]);
  });

  it('hides the action for a variant that is not hardware-tested, and refuses it', async () => {
    const h = await online({ hardwareTested: false });
    const eligibility = await h.service.eligibility(1);
    expect(eligibility).toEqual({ hidden: true, blockers: ['not-hardware-tested'] });
    await expect(h.service.start(1, 'Lab door', ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each<[string, HarnessOptions, string[]]>([
    ['no capability', { secureConversion: false }, ['no-secure-conversion']],
    [
      'a debug build',
      { build: { profile: 'plain', release: true, variant: 'touch-v2-debug' } },
      ['demo-or-debug-variant'],
    ],
    ['a dev build', { build: { profile: 'plain', release: false, variant: 'touch-v2' } }, ['not-release-build']],
    [
      'a secure-lab build',
      { build: { profile: 'secure-lab', release: true, variant: 'touch-v2' } },
      ['not-plain-profile'],
    ],
  ])('blocks %s', async (_name, options, blockers) => {
    const h = await online(options);
    expect((await h.service.eligibility(1)).blockers).toEqual(blockers);
    await expect(h.service.preflight(1, ADMIN)).rejects.toBeInstanceOf(ConflictException);
    await expect(h.service.start(1, 'Lab door', ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  describe('the lab-only stop-before-burn allowance (HIL on the plain lab reader)', () => {
    const lab = {
      build: { profile: 'plain' as const, release: false, variant: 'touch-v2' },
      stopBeforeBurnBuild: true,
    };
    afterEach(() => delete process.env['ATTRACTAP_CONVERSION_LAB_STOP_BEFORE_BURN']);

    it('keeps the release gate without the lab flag', async () => {
      const h = await online(lab);
      expect((await h.service.eligibility(1)).blockers).toEqual(['not-release-build']);
    });

    it('skips only the release gate, only for a stop-before-burn build, when the lab flag is set', async () => {
      process.env['ATTRACTAP_CONVERSION_LAB_STOP_BEFORE_BURN'] = 'true';
      expect((await (await online(lab)).service.eligibility(1)).blockers).toEqual([]);
      const burningDevBuild = await online({ ...lab, stopBeforeBurnBuild: false });
      expect((await burningDevBuild.service.eligibility(1)).blockers).toEqual(['not-release-build']);
      const untested = await online({ ...lab, hardwareTested: false });
      expect((await untested.service.eligibility(1)).blockers).toContain('not-hardware-tested');
    });
  });

  it('blocks an offline reader', async () => {
    const h = createConversionHarness();
    expect((await h.service.eligibility(1)).blockers).toEqual(['reader-offline']);
    await expect(h.service.start(1, 'Lab door', ADMIN)).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks an unpaired, already secured or differently burned reader', async () => {
    const h = await online();
    await h.readers.applySecurity(1, {
      secured: true,
      secureBootDigest0: 'a'.repeat(64),
      secureBootDigest1: 'b'.repeat(64),
    });
    (h.readers.readers.get(1) as { pairingState: string }).pairingState = 'revoked';
    expect((await h.service.eligibility(1)).blockers).toEqual(['reader-unpaired', 'already-secured', 'digests-differ']);
  });

  it('allows a reader whose recorded digests are the ones this conversion burns (a retry after the burn)', async () => {
    const h = await online();
    await h.readers.applySecurity(1, { secureBootDigest0: DIGESTS.digest0, secureBootDigest1: DIGESTS.digest1 });
    expect((await h.service.eligibility(1)).blockers).toEqual([]);
  });

  it('allows one conversion per installation', async () => {
    const h = await online();
    await h.service.start(1, 'Lab door', ADMIN);
    expect((await h.service.eligibility(1)).blockers).toEqual(['conversion-running']);
    await expect(h.service.start(1, 'Lab door', ADMIN)).rejects.toBeInstanceOf(ConflictException);
    // The store refuses a second active row even when the gate check raced.
    await expect(
      h.conversions.insert(
        { readerId: 2, target: h.conversions.rows[0].target, ...DIGESTS, preflight: null, actorId: 1 },
        new Date(),
      ),
    ).resolves.toBeNull();
  });

  it('requires the typed reader name', async () => {
    const h = await online();
    await expect(h.service.start(1, 'lab door', ADMIN)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.conversions.rows).toEqual([]);
  });

  it('runs a read-only standalone preflight and audits it', async () => {
    const h = await online();
    const running = h.service.preflight(1, ADMIN);
    await h.settle();
    const [request] = h.sentToReader().splice(0);
    expect(request).toEqual({ t: 'conversion.preflight', id: 0 });
    await h.fromReader(h.device.onControl(request).control);
    const result = await running;
    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.check)).toContain('partition-table');
    expect(h.conversions.rows).toEqual([]);
    expect(h.audit.events.at(-1)).toMatchObject({
      action: 'attractap.reader.secure_conversion_preflight',
      details: { ok: true, failedChecks: 0 },
    });
  });

  it('reports a failing standalone preflight with the failed checks', async () => {
    const h = await online({ faults: { smallFlash: true } });
    const running = h.service.preflight(1, ADMIN);
    await h.settle();
    await h.fromReader(h.device.onControl(h.sentToReader().splice(0)[0]).control);
    const result = await running;
    expect(result.ok).toBe(false);
    expect(result.checks.filter((check) => !check.ok).map((check) => check.check)).toEqual(['flash-size']);
  });

  it('says "No signing key for this reader" when no held key matches its digests', async () => {
    const h = await online();
    await h.readers.applySecurity(1, { secureBootDigest0: 'a'.repeat(64), secureBootDigest1: 'b'.repeat(64) });
    expect((await h.service.status(1)).signingKeyAvailable).toBe(false);
    await h.readers.applySecurity(1, { secureBootDigest0: DIGESTS.digest0, secureBootDigest1: DIGESTS.digest1 });
    expect((await h.service.status(1)).signingKeyAvailable).toBe(true);
  });
});
