import { projectAttractapAuditEvent, type AttractapAuditAction } from '../../audit/policies/attractap';
import { ReaderDeletedEvent } from '../events';
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
    // Normative ordering, checked at the moment each command is sent: the digests are on the reader record before the
    // burn command leaves, and the read-back burn report is persisted before the bootloader write is commanded.
    const seen: string[] = [];
    const violations: string[] = [];
    h.onSend((message) => {
      seen.push(String(message['t']));
      if (message['t'] === 'conversion.burn' && !h.log.includes('reader:digests')) violations.push('burn first');
      if (
        message['t'] === 'conversion.write-bootloader' &&
        (!h.log.includes('conversion:burnReport') || h.conversions.rows[0].state !== 'digests-burned')
      ) {
        violations.push('write-bootloader first');
      }
    });

    const status = await h.service.start(1, ' Lab door ', ADMIN);
    expect(status.conversion?.state).toBe('preflight');
    await h.pump();

    expect(seen).toEqual([
      'conversion.preflight',
      'conversion.offer',
      'conversion.burn',
      'conversion.write-bootloader',
    ]);
    expect(violations).toEqual([]);
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

  it('refuses a cancel once the reader verified (the burn command has left)', async () => {
    const h = createConversionHarness();
    await h.connect();
    const onControl = h.device.onControl.bind(h.device);
    h.device.onControl = (message) =>
      message['t'] === 'conversion.burn' ? { control: [], chunkRequests: [] } : onControl(message); // no answer yet
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    expect(await latest(h)).toMatchObject({ state: 'transferring', verified: true });
    expect((await h.service.status(1)).canCancel).toBe(false);
    await expect(h.service.cancel(1)).rejects.toThrow('can no longer be cancelled');
    expect((await latest(h)).state).toBe('transferring');
  });

  it('refuses a cancel that read the conversion just before the verification was persisted', async () => {
    const h = createConversionHarness();
    await h.connect();
    const onControl = h.device.onControl.bind(h.device);
    h.device.onControl = (message) =>
      message['t'] === 'conversion.burn' ? { control: [], chunkRequests: [] } : onControl(message);
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    // The cancel's read saw the row before `verified` was written; the write must still not win.
    const verified = await latest(h);
    const findLatest = h.conversions.findLatestForReader.bind(h.conversions);
    h.conversions.findLatestForReader = async (id) => {
      const row = await findLatest(id);
      return row && { ...row, verified: false };
    };
    await expect(h.service.cancel(1)).rejects.toThrow('can no longer be cancelled');
    expect(await h.conversions.findById(verified.id)).toMatchObject({ state: 'transferring', verified: true });
  });

  it.each([
    [{ verifyFails: true }, 'verify-failed', 'transferring', true],
    [{ digestMismatch: true }, 'digest-mismatch', 'transferring', false],
    [{ stopBeforeBurn: true }, 'burn-refused', 'transferring', true],
    [{ smallFlash: true }, 'preflight-failed', 'preflight', true],
    [{ bootloaderReadbackFails: true }, 'bootloader-write-failed', 'digests-burned', true],
  ])('fails on %j with %s', async (faults, reason, failedInState, retryable) => {
    const h = await started({ faults });
    const conversion = await latest(h);
    expect(conversion).toMatchObject({ state: 'failed', failureReason: reason, failedInState });
    expect((await h.service.status(1)).canRetry).toBe(retryable);
    if (!retryable) await expect(h.service.retry(1, ADMIN)).rejects.toThrow('cannot be retried');
    if (reason === 'digest-mismatch') expect(conversion.burnReport?.digest0).toBe('0'.repeat(64));
    if (reason === 'preflight-failed')
      expect(conversion.preflight?.find((c) => c.check === 'flash-size')?.ok).toBe(false);
  });

  it('never sends the burn to a stop-before-burn build and records no digests', async () => {
    const h = createConversionHarness({ stopBeforeBurnBuild: true, faults: { stopBeforeBurn: true } });
    await h.connect();
    const sent: string[] = [];
    h.onSend((message) => sent.push(String(message['t'])));
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    expect(sent).not.toContain('conversion.burn');
    // The server ends it and lets the reader drop its staging.
    expect(sent.at(-1)).toBe('conversion.cancel');
    const status = await h.service.status(1);
    expect(status.conversion).toMatchObject({
      state: 'failed',
      failureReason: 'burn-refused',
      failedInState: 'transferring',
      verified: true,
    });
    expect(status.canRetry).toBe(true);
    expect(h.log).not.toContain('reader:digests');
    expect(h.device).toMatchObject({ stage: 'none', profile: 'plain' });
    expect(h.device.efuse).toMatchObject({ key0: null, key1: null, burns: 0 });
    expect(await h.readers.findSecurity(1)).toMatchObject({ secureBootDigest0: null, secureBootDigest1: null });
  });

  it('takes the recorded digests back when the reader refuses the burn having burned nothing', async () => {
    const h = await started({ faults: { stopBeforeBurn: true } });
    expect(h.device.efuse).toMatchObject({ key0: null, key1: null, burns: 0 });
    // Recorded before the command (normative), cleared once the reader said it burned nothing.
    expect(h.log).toContain('reader:digests');
    expect(await h.readers.findSecurity(1)).toMatchObject({ secureBootDigest0: null, secureBootDigest1: null });
  });

  it.each(['efuse-error', 'key-blocks'])(
    'keeps the recorded digests and offers no retry after a %s refusal (the eFuses may hold digests)',
    async (reason) => {
      const h = createConversionHarness();
      await h.connect();
      const onControl = h.device.onControl.bind(h.device);
      h.device.onControl = (message) =>
        message['t'] === 'conversion.burn'
          ? { control: [{ t: 'conversion.burn-refused', id: message['id'], reason }], chunkRequests: [] }
          : onControl(message);
      await h.service.start(1, 'Lab door', ADMIN);
      await h.pump();
      expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'burn-failed' });
      expect((await h.service.status(1)).canRetry).toBe(false);
      expect(await h.readers.findSecurity(1)).toMatchObject({
        secureBootDigest0: DIGESTS.digest0,
        secureBootDigest1: DIGESTS.digest1,
      });
    },
  );

  it('does not burn digests the server no longer holds keys for', async () => {
    const h = await started({ faults: { disconnectAfterChunks: 1 } });
    await h.disconnect();
    h.keysState.signingKey = { digest: '9'.repeat(64), fingerprint: '3'.repeat(64) }; // replaced meanwhile
    const sent: string[] = [];
    h.onSend((message) => sent.push(String(message['t'])));
    await h.connect();
    await h.pump();
    expect(sent).not.toContain('conversion.burn');
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'no-signing-key' });
    expect(h.log).not.toContain('reader:digests');
    expect(h.device.stage).toBe('none');
  });

  it('offers the profile marker of the signed image', async () => {
    const h = createConversionHarness();
    await h.connect();
    const offers: unknown[] = [];
    h.onSend((message) => {
      if (message['t'] === 'conversion.offer') offers.push(message['profileMarker']);
    });
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    expect((await latest(h)).target.profileMarker).toBe('attractap-secure-profile-v2');
    expect(offers).toEqual(['attractap-secure-profile-v2']);
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

  it.each([
    [{ disconnectAfterChunks: 1 }, 'transferring'],
    [{}, 'encrypting'],
  ])('ends the conversion of a deleted reader (%j, in %s)', async (faults, state) => {
    const h = await started({ faults });
    if (state === 'encrypting') await h.disconnect();
    expect((await latest(h)).state).toBe(state);
    await h.protocol.onReaderDeleted(new ReaderDeletedEvent(1));
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'reader-changed', failedInState: state });
    await expect(h.conversions.findActive()).resolves.toBeNull();
  });

  it('leaves the conversion alone when another reader is deleted', async () => {
    const h = await started({ faults: { disconnectAfterChunks: 1 } });
    await h.protocol.onReaderDeleted(new ReaderDeletedEvent(2));
    expect((await latest(h)).state).toBe('transferring');
  });

  it('closes the session on a malformed conversion message', async () => {
    const h = createConversionHarness();
    await h.connect();
    expect(h.registry.isOnline(1)).toBe(true);
    await h.fromReader([{ t: 'conversion.burned', id: 1, mac: 'nope' }]);
    expect(h.registry.isOnline(1)).toBe(false);
  });
});
