import { Inject, Injectable } from '@nestjs/common';
import type { AttractapSecureConversionRecord } from '@attraccess/application-models';
import { AUDIT_RECORDER, type AuditActor, type AuditRecorder } from '../../audit/recorder/audit-event';

/** The reader itself (or the server on its behalf) caused the event. */
export const DEVICE_ACTOR: AuditActor = { id: null, authenticationMethod: null };

type ConversionAuditAction =
  | 'reader.secure_conversion_started'
  | 'reader.secure_conversion_preflight'
  | 'reader.secure_conversion_digests_burned'
  | 'reader.secure_conversion_failed'
  | 'reader.secure_conversion_interrupted';

/**
 * Audit entries of the secure conversion. Details are whitelisted in audit/policies/attractap.ts: ids, states,
 * reason codes, public digests and fingerprints, versions. Never key material, signatures or NVS contents.
 */
@Injectable()
export class ConversionAudit {
  public constructor(@Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder) {}

  public async record(
    action: ConversionAuditAction,
    readerId: number,
    actor: AuditActor,
    details: Record<string, string | number | boolean>,
  ): Promise<void> {
    await this.audit.record({
      domain: 'attractap',
      action: `attractap.${action}`,
      actor,
      subject: { type: 'attractap.reader', id: readerId },
      details,
    });
  }

  public async failed(conversion: AttractapSecureConversionRecord): Promise<void> {
    await this.record('reader.secure_conversion_failed', conversion.readerId, DEVICE_ACTOR, {
      conversionId: conversion.id,
      conversionState: conversion.failedInState ?? conversion.state,
      reason: conversion.failureReason ?? 'protocol-error',
    });
  }
}
