import { projectAttractapAuditEvent, type AttractapAuditAction } from '../../audit/policies/attractap';
import { INTERRUPTED_AFTER_MS } from './conversion-protocol.service';
import { ADMIN, DIGESTS, createConversionHarness, type HarnessOptions } from './secure-conversion.test-fixture';

/** Starts a conversion on a connected emulated reader and runs it until nothing moves. */
async function started(options: HarnessOptions = {}) {
  const h = createConversionHarness(options);
  await h.connect();
  await h.service.start(1, 'Lab door', ADMIN);
  await h.pump();
  return h;
}

const latest = async (h: ReturnType<typeof createConversionHarness>) =>
  (await h.conversions.findLatestForReader(1)) as NonNullable<
    Awaited<ReturnType<typeof h.conversions.findLatestForReader>>
  >;

/** The reader rebooted into the secure app and reconnects; the eFuse check (stubbed) found it secured. */
async function returnSecured(h: ReturnType<typeof createConversionHarness>) {
  h.device.reboot();
  await h.connect();
  await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
  await h.fromReader([{ t: 'efuse.report' }]);
}

describe('secure conversion against the emulated reader', () => {
  it('runs every step to secured and persists each transition', async () => {
    const h = createConversionHarness();
    await h.connect();
    // Normative ordering: the digests are on the reader record before the burn command reaches the reader,
    // and the read-back burn report is persisted before the bootloader write is commanded.
    const onControl = h.device.onControl.bind(h.device);
    const seen: string[] = [];
    h.device.onControl = (message) => {
      seen.push(String(message['t']));
      if (message['t'] === 'conversion.burn') expect(h.log).toContain('reader:digests');
      if (message['t'] === 'conversion.write-bootloader') {
        expect(h.log.indexOf('conversion:burnReport')).toBeGreaterThan(h.log.indexOf('reader:digests'));
        expect(h.conversions.rows[0].state).toBe('digests-burned');
      }
      return onControl(message);
    };

    const status = await h.service.start(1, ' Lab door ', ADMIN);
    expect(status.conversion?.state).toBe('preflight');
    await h.pump();

    expect(seen).toEqual([
      'conversion.preflight',
      'conversion.offer',
      'conversion.burn',
      'conversion.write-bootloader',
    ]);
    let conversion = await latest(h);
    expect(conversion).toMatchObject({ state: 'bootloader-written', verified: true, burnReport: { ...DIGESTS } });
    expect(conversion.bytesDone).toBe(conversion.bytesTotal);
    expect(h.device.efuse).toMatchObject({ key0: DIGESTS.digest0, key1: DIGESTS.digest1, burns: 1 });
    const reader = await h.readers.findById(1);
    expect(reader).toMatchObject({ secureBootDigest0: DIGESTS.digest0, secureBootDigest1: DIGESTS.digest1 });

    await h.disconnect(); // the reboot into brick window 2
    expect((await latest(h)).state).toBe('encrypting');

    h.device.reboot();
    await h.connect();
    expect((await latest(h)).state).toBe('migrating');
    expect(h.device.efuse.rdDisLocked).toBe(true);
    await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
    await h.fromReader([{ t: 'efuse.report' }]);
    conversion = await latest(h);
    expect(conversion).toMatchObject({ state: 'secured' });
    expect(conversion.endedAt).not.toBeNull();
    expect(h.log).toEqual([
      'conversion:insert',
      'conversion:transferring',
      'reader:digests',
      'conversion:burnReport',
      'conversion:digests-burned',
      'conversion:bootloader-written',
      'conversion:encrypting',
      'conversion:migrating',
      'conversion:secured',
    ]);
  });

  it('records the audit events with whitelisted details only', async () => {
    const h = await started({ faults: { bootloaderReadbackFails: true } });
    const actions = h.audit.events.map((event) => event.action);
    expect(actions).toEqual([
      'attractap.reader.secure_conversion_started',
      'attractap.reader.secure_conversion_preflight',
      'attractap.reader.secure_conversion_digests_burned',
      'attractap.reader.secure_conversion_failed',
    ]);
    for (const event of h.audit.events) {
      const action = event.action.replace(/^attractap\./, '') as AttractapAuditAction;
      const projected = projectAttractapAuditEvent({
        action,
        actorId: null,
        authenticationMethod: null,
        subjectId: 1,
        details: event.details as Record<string, string>,
      });
      expect(projected?.details).toEqual(event.details);
      expect(JSON.stringify(event.details)).not.toMatch(/PRIVATE|BEGIN|signature/i);
    }
  });

  it('pauses on a disconnect mid-transfer and resumes from the staged offset', async () => {
    const h = await started({ faults: { disconnectAfterChunks: 2 } });
    expect((await latest(h)).state).toBe('transferring');
    await h.disconnect();
    expect((await latest(h)).state).toBe('transferring');
    await h.connect();
    await h.pump();
    expect((await latest(h)).state).toBe('bootloader-written');
    expect(h.device.efuse.burns).toBe(1);
  });

  it('re-verifies and continues after a disconnect between the burn and the bootloader write', async () => {
    const h = createConversionHarness();
    await h.connect();
    const onControl = h.device.onControl.bind(h.device);
    let dropped = false;
    h.device.onControl = (message) => {
      if (message['t'] === 'conversion.write-bootloader' && !dropped) {
        dropped = true;
        return { control: [], chunkRequests: [] }; // lost with the connection
      }
      return onControl(message);
    };
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    expect((await latest(h)).state).toBe('digests-burned');
    await h.disconnect();
    expect((await latest(h)).state).toBe('digests-burned');
    await h.connect();
    await h.pump();
    expect((await latest(h)).state).toBe('bootloader-written');
    expect(h.device.efuse.burns).toBe(1);
  });

  it('cancels before the burn and tells the reader to drop its staging', async () => {
    const h = await started({ faults: { disconnectAfterChunks: 1 } });
    await h.disconnect();
    const status = await h.service.cancel(1);
    expect(status.conversion?.state).toBe('cancelled');
    // The reader was offline: it learns it from its status on the next session.
    await h.connect();
    await h.pump();
    expect(h.device.stage).toBe('none');
    expect(h.device.efuse.burns).toBe(0);
  });

  it('refuses a cancel after the burn', async () => {
    const h = await started({ faults: { bootloaderReadbackFails: true } });
    await expect(h.service.cancel(1)).rejects.toThrow('can no longer be cancelled');
  });

  it.each([
    [{ verifyFails: true }, 'verify-failed', 'transferring'],
    [{ digestMismatch: true }, 'digest-mismatch', 'transferring'],
    [{ stopBeforeBurn: true }, 'burn-refused', 'transferring'],
    [{ smallFlash: true }, 'preflight-failed', 'preflight'],
    [{ bootloaderReadbackFails: true }, 'bootloader-write-failed', 'digests-burned'],
  ])('fails on %j with %s', async (faults, reason, failedInState) => {
    const h = await started({ faults });
    const conversion = await latest(h);
    expect(conversion).toMatchObject({ state: 'failed', failureReason: reason, failedInState });
    expect((await h.service.status(1)).canRetry).toBe(true);
    if (reason === 'digest-mismatch') expect(conversion.burnReport?.digest0).toBe('0'.repeat(64));
    if (reason === 'preflight-failed')
      expect(conversion.preflight?.find((c) => c.check === 'flash-size')?.ok).toBe(false);
  });

  it('stop-before-burn ends before the burn and leaves the reader plain', async () => {
    const h = await started({ faults: { stopBeforeBurn: true } });
    expect(h.device.efuse).toMatchObject({ key0: null, key1: null, burns: 0 });
    expect(h.device.profile).toBe('plain');
  });

  it('retries a failed conversion when safe and completes', async () => {
    const h = await started({ faults: { verifyFails: true } });
    h.device.clearFault('verifyFails');
    const status = await h.service.retry(1, ADMIN);
    expect(status.conversion?.id).toBe(2);
    await h.pump();
    expect((await latest(h)).state).toBe('bootloader-written');
  });

  it('burns once across a retry after a failure following the burn', async () => {
    const h = await started({ faults: { bootloaderReadbackFails: true } });
    h.device.clearFault('bootloaderReadbackFails');
    await h.service.retry(1, ADMIN);
    await h.pump();
    expect((await latest(h)).state).toBe('bootloader-written');
    expect(h.device.efuse.burns).toBe(1);
  });

  it('marks a conversion interrupted after 15 minutes offline following the bootloader write, then resumes', async () => {
    const h = await started();
    await h.disconnect();
    const since = (await latest(h)).lastSeenAt as Date;
    await h.protocol.sweepInterrupted(since.getTime() + INTERRUPTED_AFTER_MS - 1000);
    expect((await latest(h)).state).toBe('encrypting');
    await h.protocol.sweepInterrupted(since.getTime() + INTERRUPTED_AFTER_MS + 1000);
    expect((await latest(h)).state).toBe('interrupted');
    expect(h.audit.events.at(-1)?.action).toBe('attractap.reader.secure_conversion_interrupted');

    await returnSecured(h);
    expect((await latest(h)).state).toBe('secured');
  });

  it('never marks an online reader interrupted', async () => {
    const h = await started();
    await h.protocol.sweepInterrupted(Date.now() + 2 * INTERRUPTED_AFTER_MS);
    expect((await latest(h)).state).toBe('bootloader-written');
  });

  it('fails when the secure app reports a failed migration', async () => {
    const h = await started({ faults: { migrationFails: true } });
    await h.disconnect();
    h.device.reboot();
    await h.connect();
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'migration-failed' });
    expect((await h.service.status(1)).canRetry).toBe(false);
  });

  it('fails when the eFuse check of the migrated reader does not pass', async () => {
    const h = await started();
    await h.disconnect();
    h.device.reboot();
    await h.connect();
    await h.fromReader([{ t: 'efuse.report' }]); // reader stays not secured
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'efuse-check-failed' });
  });

  it('fails a conversion whose pairing changed before the bootloader write', async () => {
    const h = await started({ faults: { disconnectAfterChunks: 1 } });
    await h.protocol.onCredentialChanged(1);
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'reader-changed' });
    expect((await h.service.status(1)).canRetry).toBe(false);
  });

  it('closes the session on a malformed conversion message', async () => {
    const h = createConversionHarness();
    await h.connect();
    expect(h.registry.isOnline(1)).toBe(true);
    await h.fromReader([{ t: 'conversion.burned', id: 1, mac: 'nope' }]);
    expect(h.registry.isOnline(1)).toBe(false);
  });
});
