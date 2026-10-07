import { AttractapAuditEvent } from './audit-domain-event.types';
import { dataFields, oneOf, positive } from './audit-projection';
export const attractapDetails: Record<AttractapAuditEvent['action'], ReadonlySet<string>> = {
  'reader.registered': new Set(['source']),
  'reader.deregistered': new Set(['source']),
  'card.linked': new Set(['readerId', 'source']),
  'card.unlinked': new Set(['readerId', 'source']),
  'reader.crash_reported': new Set(['source', 'resetReason', 'hasCoredump']),
};
export const attractapResetReasons = new Set([
  'POWERON',
  'EXT',
  'SW',
  'PANIC',
  'INT_WDT',
  'TASK_WDT',
  'WDT',
  'DEEPSLEEP',
  'BROWNOUT',
  'SDIO',
  'UNKNOWN',
]);
export function validAttractapDetails(
  action: AttractapAuditEvent['action'],
  details: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(details)) {
    if (
      !attractapDetails[action].has(key) ||
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    )
      return false;
    if (key === 'source' && !oneOf('reader-websocket', 'admin-api', 'reader-enrollment', 'reader-reset')(value))
      return false;
    if (key === 'resetReason' && !attractapResetReasons.has(value as string)) return false;
    if (key === 'hasCoredump' && typeof value !== 'boolean') return false;
    if (key === 'readerId' && !positive(value)) return false;
  }
  return true;
}

export function projectAttractapAuditEvent(input: AttractapAuditEvent): AttractapAuditEvent | null {
  if (!positive(input.subjectId) || !attractapDetails[input.action]) return null;
  const deviceActor = input.authenticationMethod === null;
  if (deviceActor ? input.actorId !== null || input.apiTokenId !== undefined : !positive(input.actorId)) return null;
  if (!deviceActor && input.authenticationMethod !== 'session' && input.authenticationMethod !== 'api-token')
    return null;
  if (input.authenticationMethod === 'api-token' ? !positive(input.apiTokenId) : input.apiTokenId !== undefined)
    return null;
  const details = dataFields(input.details, [...attractapDetails[input.action]]);
  if (!details) return null;
  if (!validAttractapDetails(input.action, details)) return null;
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  return { ...input, details: details as Record<string, string | number | boolean> };
}

export const ATTRACTAP_AUDIT_ACTIONS = [
  'attractap.reader.registered',
  'attractap.reader.deregistered',
  'attractap.card.linked',
  'attractap.card.unlinked',
  'attractap.reader.crash_reported',
];
