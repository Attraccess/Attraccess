import { INTERRUPTED_AFTER_MS } from './conversion-protocol.service';
import { ADMIN, createConversionHarness, type HarnessOptions } from './secure-conversion.test-fixture';

type Harness = ReturnType<typeof createConversionHarness>;

const latest = async (h: Harness) =>
  (await h.conversions.findLatestForReader(1)) as NonNullable<
    Awaited<ReturnType<typeof h.conversions.findLatestForReader>>
  >;

/** Starts a conversion whose reader's answer to `dropReplyTo` is lost (the reader still acts on the command). */
async function startedLosing(dropReplyTo: string, options: HarnessOptions = {}) {
  const h = createConversionHarness(options);
  await h.connect();
  const onControl = h.device.onControl.bind(h.device);
  let dropped = false;
  h.device.onControl = (message) => {
    const out = onControl(message);
    if (message['t'] !== dropReplyTo || dropped) return out;
    dropped = true;
    return { control: [], chunkRequests: [] };
  };
  await h.service.start(1, 'Lab door', ADMIN);
  await h.pump();
  return h;
}

/** Starts a conversion whose write-bootloader command never reaches the reader (stays digests-burned). */
async function stoppedBeforeBootloaderWrite() {
  const h = createConversionHarness();
  await h.connect();
  const onControl = h.device.onControl.bind(h.device);
  let dropped = false;
  h.device.onControl = (message) => {
    if (message['t'] !== 'conversion.write-bootloader' || dropped) return onControl(message);
    dropped = true;
    return { control: [], chunkRequests: [] };
  };
  await h.service.start(1, 'Lab door', ADMIN);
  await h.pump();
  return h;
}

describe('secure conversion recovery after lost reports and long outages', () => {
  it('continues when the bootloader-written report was lost and the reader returns as the secure app', async () => {
    const h = await startedLosing('conversion.write-bootloader');
    expect((await latest(h)).state).toBe('digests-burned');
    expect(h.device.stage).toBe('bootloader-written');
    await h.disconnect();
    h.device.reboot();
    await h.connect();
    expect((await latest(h)).state).toBe('migrating');
    await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
    await h.fromReader([{ t: 'efuse.report' }]);
    expect((await latest(h)).state).toBe('secured');
  });

  it('fails a lost-report conversion whose secure app reports a failed migration', async () => {
    const h = await startedLosing('conversion.write-bootloader', { faults: { migrationFails: true } });
    await h.disconnect();
    h.device.reboot();
    await h.connect();
    expect(await latest(h)).toMatchObject({
      state: 'failed',
      failureReason: 'migration-failed',
      failedInState: 'bootloader-written',
    });
  });

  it('accepts a passing eFuse check while still in digests-burned', async () => {
    const h = await startedLosing('conversion.write-bootloader');
    await h.disconnect();
    h.device.reboot();
    await h.connect(false); // the status got lost as well
    await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
    await h.fromReader([{ t: 'efuse.report' }]);
    expect((await latest(h)).state).toBe('secured');
  });

  it('marks digests-burned interrupted after 15 minutes offline, and resumes when the plain app returns', async () => {
    const h = await stoppedBeforeBootloaderWrite();
    expect((await latest(h)).state).toBe('digests-burned');
    await h.disconnect();
    const since = ((await latest(h)).lastSeenAt as Date).getTime();
    await h.protocol.sweepInterrupted(since + INTERRUPTED_AFTER_MS - 1000);
    expect((await latest(h)).state).toBe('digests-burned');
    await h.protocol.sweepInterrupted(since + INTERRUPTED_AFTER_MS + 1000);
    expect((await latest(h)).state).toBe('interrupted');
    expect(h.audit.events.at(-1)?.action).toBe('attractap.reader.secure_conversion_interrupted');

    await h.connect(); // the plain app still runs: stage `burned`
    await h.pump();
    expect((await latest(h)).state).toBe('bootloader-written');
    expect(h.device.efuse.burns).toBe(1);
  });

  it('turns a failed migration into secured when a later boot migrated and the eFuse check passes', async () => {
    const h = createConversionHarness({ faults: { migrationFails: true } });
    await h.connect();
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    await h.disconnect();
    h.device.reboot();
    await h.connect();
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'migration-failed' });

    // The secure app retried the migration on the next boot; its eFuse report now passes.
    await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
    await h.fromReader([{ t: 'efuse.report' }]);
    expect(await latest(h)).toMatchObject({ state: 'secured', failureReason: null, failedInState: null });
  });

  it('leaves other failures alone when the reader is later found secured', async () => {
    const h = createConversionHarness({ faults: { verifyFails: true } });
    await h.connect();
    await h.service.start(1, 'Lab door', ADMIN);
    await h.pump();
    await h.readers.applySecurity(1, { secured: true, securedAt: new Date() });
    await h.fromReader([{ t: 'efuse.report' }]);
    expect(await latest(h)).toMatchObject({ state: 'failed', failureReason: 'verify-failed' });
  });
});
