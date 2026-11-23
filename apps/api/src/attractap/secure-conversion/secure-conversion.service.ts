import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AttractapConversionBlocker,
  AttractapConversionFailure,
  AttractapConversionState,
  AttractapPreflightCheckResult,
  AttractapReader,
  AttractapSecureConversionRecord,
} from '@attraccess/application-models';
import { ATTRACTAP_CONVERSION_CANCELLABLE_STATES } from '@attraccess/application-models';
import type { AuditActor } from '../../audit/recorder/audit-event';
import { AttractapFirmwareService } from '../firmware.service';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { SecureBootKeyService } from '../secure-boot/secure-boot-key.service';
import { isDemoVariant } from '../security/secured-eligibility';
import { ConversionAudit } from './conversion-audit';
import { ConversionImages, isMissingKeyOrImage } from './conversion-images';
import { ConversionProtocolService } from './conversion-protocol.service';
import { ConversionSessionRegistry } from './conversion-session-registry';
import { evaluatePreflight, preflightPassed } from './preflight';
import { PreflightExpectations } from './preflight-expectations';
import { ATTRACTAP_SECURE_CONVERSION_STORE, type AttractapSecureConversionStore } from './secure-conversion-store.port';

/** How long an admin preflight waits for the reader's report. */
export const PREFLIGHT_TIMEOUT_MS = 15_000;
/** Failures in these states left nothing irreversible behind, or only the burned digests: a retry is safe. */
const RETRYABLE_FAILED_IN: readonly AttractapConversionState[] = ['preflight', 'transferring', 'digests-burned'];

export interface ConversionEligibility {
  /** The variant is not hardware-tested: the action is hidden, not just disabled. */
  hidden: boolean;
  blockers: AttractapConversionBlocker[];
}

export interface ConversionPreflightResult {
  ok: boolean;
  checks: AttractapPreflightCheckResult[];
}

export interface ConversionStatus {
  conversion: AttractapSecureConversionRecord | null;
  online: boolean;
  canCancel: boolean;
  canRetry: boolean;
  /** For readers with recorded digests: whether the server holds a key that can sign their updates. */
  signingKeyAvailable: boolean | null;
}

/** Admin side of "Secure this reader": the gates, preflight, start, cancel, retry and the status the UI polls. */
@Injectable()
export class SecureConversionService {
  public constructor(
    @Inject(ATTRACTAP_SECURE_CONVERSION_STORE) private readonly conversions: AttractapSecureConversionStore,
    @Inject(ATTRACTAP_READER_STORE) private readonly readers: AttractapReaderStore,
    private readonly firmware: AttractapFirmwareService,
    private readonly keys: SecureBootKeyService,
    private readonly registry: ConversionSessionRegistry,
    private readonly protocol: ConversionProtocolService,
    private readonly images: ConversionImages,
    private readonly expectations: PreflightExpectations,
    private readonly audit: ConversionAudit,
  ) {}

  private async reader(readerId: number): Promise<AttractapReader> {
    const reader = await this.readers.findById(readerId);
    if (!reader) throw new NotFoundException('Reader not found');
    return reader;
  }

  /** The digests a conversion burns now: KEY0 = current signing key, KEY1 = current recovery key. */
  private async targetDigests(): Promise<{ digest0: string; digest1: string } | null> {
    const state = await this.keys.getState();
    if (!state.signingKey || !state.recoveryKey) return null;
    return { digest0: state.signingKey.digest.toLowerCase(), digest1: state.recoveryKey.digest.toLowerCase() };
  }

  /** Every server-side gate. The same list decides the UI's button and is enforced on preflight, start and retry. */
  public async eligibility(readerId: number): Promise<ConversionEligibility> {
    const reader = await this.reader(readerId);
    const blockers: AttractapConversionBlocker[] = [];
    const name = reader.firmware.name;
    const variant = reader.firmware.variant;
    const catalog = name && variant ? this.firmware.getFirmwareDefinition(name, variant) : undefined;
    if (!catalog?.secureProfileHardwareTested || isDemoVariant(variant)) blockers.push('not-hardware-tested');
    if (!name || !variant || !this.firmware.getSecureImageSource(name, variant)) blockers.push('no-secure-image');
    if ((await this.keys.getState()).status !== 'ready') blockers.push('recovery-check-missing');
    if (reader.pairingState !== 'paired') blockers.push('reader-unpaired');

    // A reader that is still connecting has not sent READER_FIRMWARE_INFO yet: offline, not a list of wrong gates.
    const session = this.registry.get(readerId)?.state.firmware ? this.registry.get(readerId) : null;
    const build = session?.state.reportedBuild ?? null;
    if (!session) blockers.push('reader-offline');
    else {
      if (!session.state.secureConversion) blockers.push('no-secure-conversion');
      if (!build?.release && !labStopBeforeBurn(session.state)) blockers.push('not-release-build');
      if (isDemoVariant(build?.variant ?? null)) blockers.push('demo-or-debug-variant');
      if (build?.profile !== 'plain') blockers.push('not-plain-profile');
    }
    if (reader.secured) blockers.push('already-secured');
    const digests = await this.targetDigests();
    const recorded = [reader.secureBootDigest0, reader.secureBootDigest1];
    if (recorded.some(Boolean) && (!digests || recorded[0] !== digests.digest0 || recorded[1] !== digests.digest1)) {
      blockers.push('digests-differ');
    }
    const active = await this.conversions.findActive();
    if (active) blockers.push('conversion-running');
    return { hidden: blockers.includes('not-hardware-tested'), blockers };
  }

  /** Without the permission to secure readers the caller sees only whether the action exists at all. */
  public async eligibilityFor(readerId: number, canSecure: boolean): Promise<ConversionEligibility> {
    const eligibility = await this.eligibility(readerId);
    return canSecure ? eligibility : { hidden: eligibility.hidden, blockers: ['missing-permission'] };
  }

  private async assertEligible(readerId: number): Promise<void> {
    const { blockers } = await this.eligibility(readerId);
    if (blockers.includes('recovery-check-missing')) {
      throw new ConflictException('The recovery key check has not passed yet');
    }
    // The codes go in their own field, so the admin UI can name each reason in its language.
    if (blockers.length) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: `This reader cannot be secured now: ${blockers.join(', ')}`,
        blockers,
      });
    }
  }

  /** Read-only preflight: asks the reader for its report and checks it. Nothing is written on the reader. */
  public async preflight(readerId: number, actor: AuditActor): Promise<ConversionPreflightResult> {
    await this.assertEligible(readerId);
    const reader = await this.reader(readerId);
    const session = this.registry.get(readerId);
    const digests = await this.targetDigests();
    const expectation =
      digests && this.expectations.for(reader.firmware.name ?? '', reader.firmware.variant ?? '', digests);
    if (!session || !expectation) throw new ConflictException('This reader cannot be secured now');
    const waiting = this.registry.awaitPreflight(readerId, PREFLIGHT_TIMEOUT_MS);
    this.protocol.sendPreflight(session, 0);
    const report = await waiting;
    if (!report) throw new ConflictException('The reader did not answer the preflight in time');
    const checks = evaluatePreflight(report, expectation);
    const ok = preflightPassed(checks);
    await this.audit.record('reader.secure_conversion_preflight', readerId, actor, {
      ok,
      failedChecks: checks.filter((check) => !check.ok).length,
    });
    return { ok, checks };
  }

  /** Starts a conversion. The admin typed the reader's name; every gate is checked again on the server. */
  public async start(readerId: number, confirmName: string, actor: AuditActor): Promise<ConversionStatus> {
    const reader = await this.reader(readerId);
    if (typeof confirmName !== 'string' || confirmName.trim() !== reader.name.trim()) {
      throw new BadRequestException('The typed name does not match the reader name');
    }
    return await this.begin(reader, actor);
  }

  private async begin(reader: AttractapReader, actor: AuditActor): Promise<ConversionStatus> {
    await this.assertEligible(reader.id);
    const digests = await this.targetDigests();
    const name = reader.firmware.name;
    const variant = reader.firmware.variant;
    const catalog = name && variant ? this.firmware.getFirmwareDefinition(name, variant) : undefined;
    if (!digests || !name || !variant || !catalog) throw new ConflictException('This reader cannot be secured now');
    let target;
    try {
      target = await this.images.target(name, variant, String(catalog.version), digests);
    } catch (error) {
      if (isMissingKeyOrImage(error)) throw new ConflictException('No signing key for this reader');
      throw error;
    }
    const conversion = await this.conversions.insert(
      { readerId: reader.id, target, ...digests, preflight: null, actorId: actor.id },
      new Date(),
    );
    if (!conversion) throw new ConflictException('Another conversion is running');
    const state = await this.keys.getState();
    await this.audit.record('reader.secure_conversion_started', reader.id, actor, {
      conversionId: conversion.id,
      conversionState: conversion.state,
      targetVersion: target.version,
      signingFingerprint: state.signingKey?.fingerprint ?? '',
      recoveryFingerprint: state.recoveryKey?.fingerprint ?? '',
    });
    const session = this.registry.get(reader.id);
    if (session) this.protocol.sendPreflight(session, conversion.id);
    return await this.status(reader.id);
  }

  /** Before the burn only: afterwards the reader is past the point where stopping helps. */
  public async cancel(readerId: number): Promise<ConversionStatus> {
    const conversion = await this.conversions.findLatestForReader(readerId);
    if (!conversion || !ATTRACTAP_CONVERSION_CANCELLABLE_STATES.includes(conversion.state)) {
      throw new ConflictException('This conversion can no longer be cancelled');
    }
    const now = new Date();
    const cancelled = await this.conversions.update(
      conversion.id,
      { state: 'cancelled', stateChangedAt: now, endedAt: now },
      ATTRACTAP_CONVERSION_CANCELLABLE_STATES,
    );
    if (!cancelled) throw new ConflictException('This conversion can no longer be cancelled');
    const session = this.registry.get(readerId);
    // An offline reader is told when it comes back and reports the stale staging.
    if (session) this.protocol.sendCancel(session, conversion.id);
    return await this.status(readerId);
  }

  /** A failed conversion that burned at most the digests starts over: a fresh preflight, the same digests. */
  public async retry(readerId: number, actor: AuditActor): Promise<ConversionStatus> {
    const latest = await this.conversions.findLatestForReader(readerId);
    if (!latest || !canRetry(latest)) throw new ConflictException('This conversion cannot be retried');
    return await this.begin(await this.reader(readerId), actor);
  }

  public async status(readerId: number): Promise<ConversionStatus> {
    const reader = await this.reader(readerId);
    const conversion = await this.conversions.findLatestForReader(readerId);
    const hasDigests = Boolean(reader.secureBootDigest0 || reader.secureBootDigest1);
    return {
      conversion,
      online: this.registry.isOnline(readerId),
      canCancel: !!conversion && ATTRACTAP_CONVERSION_CANCELLABLE_STATES.includes(conversion.state),
      canRetry: !!conversion && canRetry(conversion),
      signingKeyAvailable: hasDigests ? (await this.keys.signingKeyForReader(reader)) !== null : null,
    };
  }

  /** The installation's active conversion, for the reader list. */
  public async active(): Promise<AttractapSecureConversionRecord | null> {
    return await this.conversions.findActive();
  }
}

/**
 * HIL on the plain lab reader (ATT-1208 decision 6): its image has test hooks, so it is not a release build. Only when
 * the lab-only environment flag is set, and only for a reader whose firmware was built with stop-before-burn (it
 * refuses every burn), the release-build gate is skipped. No other gate changes, and no release API sets the flag.
 */
export function labStopBeforeBurn(state: { conversionStopBeforeBurn: boolean }): boolean {
  return process.env['ATTRACTAP_CONVERSION_LAB_STOP_BEFORE_BURN'] === 'true' && state.conversionStopBeforeBurn;
}

function canRetry(conversion: AttractapSecureConversionRecord): boolean {
  const reason: AttractapConversionFailure | null = conversion.failureReason;
  return (
    conversion.state === 'failed' &&
    conversion.failedInState !== null &&
    RETRYABLE_FAILED_IN.includes(conversion.failedInState) &&
    reason !== 'reader-changed'
  );
}
