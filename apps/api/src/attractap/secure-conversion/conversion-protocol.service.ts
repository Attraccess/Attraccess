import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AttractapConversionFailure,
  AttractapConversionState,
  AttractapSecureConversionPatch,
  AttractapSecureConversionRecord,
} from '@attraccess/application-models';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { CREDENTIAL_CHANGED_EVENT } from '../security/pairing-model';
import { SECURE_VERSION_FLOOR } from '../security/efuse-report';
import { ConversionAudit, DEVICE_ACTOR } from './conversion-audit';
import type {
  BootloaderWrittenMessage,
  BurnedMessage,
  ConversionMessage,
  ConversionStage,
  ConversionStatusMessage,
  PreflightReport,
  VerifiedMessage,
} from './conversion-messages';
import { ConversionSessionRegistry, type ConversionSession } from './conversion-session-registry';
import { evaluatePreflight, preflightMac, preflightPassed } from './preflight';
import { PreflightExpectations } from './preflight-expectations';
import { ATTRACTAP_SECURE_CONVERSION_STORE, type AttractapSecureConversionStore } from './secure-conversion-store.port';

/** Offline for longer than this after the bootloader write, and not secured: the conversion is interrupted. */
export const INTERRUPTED_AFTER_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** States after the reader rebooted into the new bootloader: only the reader's own report can move them on. */
const AFTER_BOOTLOADER: readonly AttractapConversionState[] = [
  'bootloader-written',
  'encrypting',
  'migrating',
  'interrupted',
];
/** States before anything irreversible was written to the reader's boot path. */
const BEFORE_BOOTLOADER: readonly AttractapConversionState[] = ['preflight', 'transferring', 'digests-burned'];

const PROFILE_MARKER = 'attractap-secure-profile-v1';

/**
 * The reader side of "Secure this reader": every message a reader sends about its conversion, the session ends and
 * the interrupted sweep. Each transition is persisted (compare and set on the state) before the next command leaves.
 */
@Injectable()
export class ConversionProtocolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionProtocolService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  public constructor(
    @Inject(ATTRACTAP_SECURE_CONVERSION_STORE) private readonly conversions: AttractapSecureConversionStore,
    @Inject(ATTRACTAP_READER_STORE) private readonly readers: AttractapReaderStore,
    private readonly registry: ConversionSessionRegistry,
    private readonly expectations: PreflightExpectations,
    private readonly audit: ConversionAudit,
  ) {}

  public onModuleInit(): void {
    this.sweepTimer = setInterval(() => void this.sweepInterrupted().catch(() => undefined), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  public onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ---- transitions -------------------------------------------------------------------------------------------

  /** Moves a conversion on, only while it is still in one of `from`. Null when another change won. */
  private async move(
    conversion: AttractapSecureConversionRecord,
    patch: AttractapSecureConversionPatch,
    from: readonly AttractapConversionState[] = [conversion.state],
  ): Promise<AttractapSecureConversionRecord | null> {
    const now = new Date();
    const changesState = patch.state !== undefined && patch.state !== conversion.state;
    const ending = patch.state === 'secured' || patch.state === 'failed' || patch.state === 'cancelled';
    return await this.conversions.update(
      conversion.id,
      { ...patch, ...(changesState ? { stateChangedAt: now } : {}), ...(ending ? { endedAt: now } : {}) },
      from,
    );
  }

  public async fail(
    conversion: AttractapSecureConversionRecord,
    reason: AttractapConversionFailure,
  ): Promise<AttractapSecureConversionRecord | null> {
    const failed = await this.move(conversion, {
      state: 'failed',
      failedInState: conversion.state,
      failureReason: reason,
    });
    if (failed) await this.audit.failed(failed);
    return failed;
  }

  // ---- commands to the reader --------------------------------------------------------------------------------

  private send(session: ConversionSession, message: Record<string, unknown>): void {
    if (!session.send(message)) this.logger.warn(`Conversion command not sent (reader ${session.state.readerId})`);
  }

  public sendPreflight(session: ConversionSession, id: number): void {
    this.send(session, { t: 'conversion.preflight', id });
  }

  private sendOffer(session: ConversionSession, conversion: AttractapSecureConversionRecord): void {
    const { target } = conversion;
    this.send(session, {
      t: 'conversion.offer',
      id: conversion.id,
      variant: target.variant,
      profileMarker: PROFILE_MARKER,
      secureVersionFloor: SECURE_VERSION_FLOOR,
      digest0: conversion.digest0,
      digest1: conversion.digest1,
      app: { size: target.appSize, sha256: target.appSha256 },
      bootloader: { size: target.bootloaderSize, sha256: target.bootloaderSha256 },
    });
  }

  /**
   * The burn: the digests are written to the reader's record first (normative), only then the command leaves. It names
   * the reader's MAC from the preflight and both digests; the firmware refuses any mismatch.
   */
  private async sendBurn(session: ConversionSession, conversion: AttractapSecureConversionRecord): Promise<void> {
    const mac = preflightMac(conversion.preflight);
    if (!mac) {
      await this.fail(conversion, 'protocol-error');
      return;
    }
    const recorded = await this.readers.applySecurity(
      conversion.readerId,
      {
        secureBootDigest0: conversion.digest0,
        secureBootDigest1: conversion.digest1,
        secureBootSignerDigest: conversion.digest0,
      },
      session.state.fingerprint,
    );
    if (!recorded) {
      await this.fail(conversion, 'reader-changed');
      return;
    }
    this.send(session, {
      t: 'conversion.burn',
      id: conversion.id,
      mac,
      digest0: conversion.digest0,
      digest1: conversion.digest1,
    });
  }

  private sendWriteBootloader(session: ConversionSession, conversion: AttractapSecureConversionRecord): void {
    this.send(session, { t: 'conversion.write-bootloader', id: conversion.id });
  }

  public sendCancel(session: ConversionSession, id: number): void {
    this.send(session, { t: 'conversion.cancel', id });
  }

  // ---- reader messages ---------------------------------------------------------------------------------------

  /** One conversion message from a reader's session. Messages of one session arrive one after the other. */
  public async handle(session: ConversionSession, message: ConversionMessage): Promise<void> {
    const readerId = session.state.readerId;
    if (message.t === 'conversion.preflight-report') this.registry.deliverPreflight(readerId, message);

    const active = await this.conversions.findActive();
    const conversion = active?.readerId === readerId ? active : null;
    if (message.t === 'conversion.status') {
      await this.onStatus(session, conversion, message);
      return;
    }
    if (!conversion || conversion.id !== message.id) return; // a stale or standalone (admin preflight) message
    const seen = (await this.move(conversion, { lastSeenAt: new Date() })) ?? conversion;
    switch (message.t) {
      case 'conversion.preflight-report':
        return await this.onPreflight(session, seen, message);
      case 'conversion.verified':
        return await this.onVerified(session, seen, message);
      case 'conversion.burned':
        return await this.onBurned(session, seen, message);
      case 'conversion.burn-refused':
        if (seen.state === 'transferring' || seen.state === 'digests-burned') await this.fail(seen, 'burn-refused');
        return;
      case 'conversion.bootloader-written':
        return await this.onBootloaderWritten(seen, message);
    }
  }

  /** Sent once per session: resumes the conversion from what the reader has (or cleans up stale staging). */
  private async onStatus(
    session: ConversionSession,
    conversion: AttractapSecureConversionRecord | null,
    status: ConversionStatusMessage,
  ): Promise<void> {
    if (!conversion) {
      // Staging of a conversion that is no longer active and burned nothing: the reader may delete it.
      if (status.id !== null && (status.stage === 'transferring' || status.stage === 'verified')) {
        this.sendCancel(session, status.id);
      }
      return;
    }
    const seen = (await this.move(conversion, { lastSeenAt: new Date() })) ?? conversion;
    const stage: ConversionStage = status.id === seen.id ? status.stage : 'none';
    if (AFTER_BOOTLOADER.includes(seen.state)) {
      await this.onReturnAfterBootloader(seen, stage, status);
      return;
    }
    await this.drive(session, seen, stage);
  }

  /** Continues a conversion that has not written the bootloader yet, from the reader's stage. */
  public async drive(
    session: ConversionSession,
    conversion: AttractapSecureConversionRecord,
    stage: ConversionStage,
  ): Promise<void> {
    if (conversion.state === 'preflight') return this.sendPreflight(session, conversion.id);
    if (conversion.state === 'transferring') {
      if (conversion.verified && stage === 'verified') return await this.sendBurn(session, conversion);
      return this.sendOffer(session, conversion);
    }
    if (conversion.state === 'digests-burned') {
      // After the burn: re-verify (the reader verifies again before it writes the bootloader), then continue.
      if (stage === 'verified' || stage === 'burned') return this.sendWriteBootloader(session, conversion);
      return this.sendOffer(session, conversion);
    }
  }

  private async onReturnAfterBootloader(
    conversion: AttractapSecureConversionRecord,
    stage: ConversionStage,
    status: ConversionStatusMessage,
  ): Promise<void> {
    if (stage === 'migration-failed') {
      await this.fail(conversion, 'migration-failed');
      return;
    }
    if (stage === 'migrated') {
      if (!status.rdDisLocked) {
        await this.fail(conversion, 'migration-failed');
        return;
      }
      // The secure app runs and migrated; the eFuse report that follows in this session decides `secured`.
      await this.move(conversion, { state: 'migrating' }, AFTER_BOOTLOADER);
    }
  }

  private async onPreflight(
    session: ConversionSession,
    conversion: AttractapSecureConversionRecord,
    report: PreflightReport,
  ): Promise<void> {
    if (conversion.state !== 'preflight') return;
    const expectation = this.expectations.for(conversion.target.firmwareName, conversion.target.variant, conversion);
    const checks = expectation ? evaluatePreflight(report, expectation) : null;
    const ok = checks !== null && preflightPassed(checks);
    await this.audit.record('reader.secure_conversion_preflight', conversion.readerId, DEVICE_ACTOR, {
      conversionId: conversion.id,
      conversionState: conversion.state,
      ok,
      failedChecks: checks ? checks.filter((check) => !check.ok).length : 0,
    });
    if (!ok) {
      const withChecks = (await this.move(conversion, { preflight: checks })) ?? conversion;
      await this.fail(withChecks, checks ? 'preflight-failed' : 'image-unavailable');
      return;
    }
    const total = conversion.target.appSize + conversion.target.bootloaderSize;
    const next = await this.move(conversion, {
      state: 'transferring',
      preflight: checks,
      bytesDone: 0,
      bytesTotal: total,
    });
    if (next) this.sendOffer(session, next);
  }

  private async onVerified(
    session: ConversionSession,
    conversion: AttractapSecureConversionRecord,
    verified: VerifiedMessage,
  ): Promise<void> {
    if (conversion.state !== 'transferring' && conversion.state !== 'digests-burned') return;
    if (!verified.ok) {
      await this.fail(conversion, 'verify-failed');
      return;
    }
    if (conversion.state === 'digests-burned') return this.sendWriteBootloader(session, conversion);
    const next = await this.move(conversion, { verified: true, bytesDone: conversion.bytesTotal });
    if (next) await this.sendBurn(session, next);
  }

  /** The read-back burn report is persisted first; only then does the next command leave. */
  private async onBurned(
    session: ConversionSession,
    conversion: AttractapSecureConversionRecord,
    burned: BurnedMessage,
  ): Promise<void> {
    if (conversion.state !== 'transferring' || !conversion.verified) return;
    const burnReport = { mac: burned.mac, digest0: burned.digest0, digest1: burned.digest1 };
    const matches =
      burned.digest0 === conversion.digest0 &&
      burned.digest1 === conversion.digest1 &&
      burned.mac === preflightMac(conversion.preflight) &&
      burned.key0Purpose === 'SECURE_BOOT_DIGEST0' &&
      burned.key1Purpose === 'SECURE_BOOT_DIGEST1';
    if (!matches) {
      const recorded = (await this.move(conversion, { burnReport })) ?? conversion;
      await this.fail(recorded, 'digest-mismatch');
      return;
    }
    const next = await this.move(conversion, { state: 'digests-burned', burnReport });
    if (!next) return;
    await this.audit.record('reader.secure_conversion_digests_burned', next.readerId, DEVICE_ACTOR, {
      conversionId: next.id,
      conversionState: next.state,
      digest0: next.digest0,
      digest1: next.digest1,
    });
    this.sendWriteBootloader(session, next);
  }

  private async onBootloaderWritten(
    conversion: AttractapSecureConversionRecord,
    written: BootloaderWrittenMessage,
  ): Promise<void> {
    if (conversion.state !== 'digests-burned') return;
    if (!written.ok || written.sha256 !== conversion.target.bootloaderSha256) {
      await this.fail(conversion, 'bootloader-write-failed');
      return;
    }
    await this.move(conversion, { state: 'bootloader-written' });
  }

  // ---- session lifecycle, eFuse check, sweep -----------------------------------------------------------------

  /** The reader's session ended. After the bootloader write that is the reboot into brick window 2. */
  public async onSessionClosed(readerId: number): Promise<void> {
    const conversion = await this.conversions.findActive();
    if (conversion?.readerId !== readerId) return;
    const patch: AttractapSecureConversionPatch = { lastSeenAt: new Date() };
    if (conversion.state === 'bootloader-written') patch.state = 'encrypting';
    await this.move(conversion, patch);
  }

  /** Called after an eFuse report of the reader was checked (T2). */
  public async onEfuseReportChecked(readerId: number): Promise<void> {
    const conversion = await this.conversions.findActive();
    if (conversion?.readerId !== readerId || !AFTER_BOOTLOADER.includes(conversion.state)) return;
    const reader = await this.readers.findSecurity(readerId);
    if (reader?.secured) {
      await this.move(conversion, { state: 'secured', lastSeenAt: new Date() }, AFTER_BOOTLOADER);
    } else if (conversion.state === 'migrating') {
      await this.fail(conversion, 'efuse-check-failed');
    }
  }

  /** `interrupted`: offline for more than 15 minutes after the bootloader write and not secured. */
  public async sweepInterrupted(now = Date.now()): Promise<void> {
    const conversion = await this.conversions.findActive();
    if (!conversion || !['bootloader-written', 'encrypting', 'migrating'].includes(conversion.state)) return;
    if (this.registry.isOnline(conversion.readerId)) return;
    const since = (conversion.lastSeenAt ?? conversion.stateChangedAt).getTime();
    if (now - since <= INTERRUPTED_AFTER_MS) return;
    const interrupted = await this.move(conversion, { state: 'interrupted' });
    if (!interrupted) return;
    await this.audit.record('reader.secure_conversion_interrupted', interrupted.readerId, DEVICE_ACTOR, {
      conversionId: interrupted.id,
      conversionState: interrupted.state,
    });
  }

  /** Pairing removed or replaced: a conversion that has not written the bootloader cannot go on with another key. */
  @OnEvent(CREDENTIAL_CHANGED_EVENT)
  public async onCredentialChanged(readerId: number): Promise<void> {
    const conversion = await this.conversions.findActive();
    if (conversion?.readerId === readerId && BEFORE_BOOTLOADER.includes(conversion.state)) {
      await this.fail(conversion, 'reader-changed');
    }
  }
}
