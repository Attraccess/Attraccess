import type { AuditRecorder } from '../../audit/recorder/audit-event';

/** A meter's rate and allocation are billing terms: every change is recorded. */
export function recordMeterUpdate(
  audit: AuditRecorder,
  resourceId: number,
  initiatorId: number,
  details: { meterId: number; meterName: string } & Record<string, string | number>,
) {
  return audit.record({
    domain: 'resource',
    action: 'meter.updated',
    actor: { id: initiatorId, authenticationMethod: 'session' },
    subject: { type: 'resource', id: resourceId },
    details,
  });
}
