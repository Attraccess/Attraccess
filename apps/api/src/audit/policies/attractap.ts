import { AttractapAuditEvent } from './domain-events';
import { dataFields, oneOf, positive } from './projection';
export const attractapDetails: Record<AttractapAuditEvent['action'], ReadonlySet<string>> = {
  'reader.registered': new Set(['source']),
  'reader.deregistered': new Set(['source']),
  'card.linked': new Set(['readerId', 'source']),
  'card.unlinked': new Set(['readerId', 'source']),
  'reader.crash_reported': new Set(['source', 'resetReason', 'hasCoredump']),
  'reader.pairing_started': new Set(['mode']),
  'reader.pairing_confirmed': new Set(['mode']),
  'reader.pairing_failed': new Set(['reason']),
  'reader.pairing_expired': new Set(['reason']),
  'reader.revoked': new Set(['reason']),
  'reader.replaced': new Set(['replacedReaderId']),
  'reader.token_rejected': new Set(['reason']),
  'reader.handshake_rejected': new Set(['reason', 'count']),
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
    if (key === 'replacedReaderId' && !positive(value)) return false;
    if (key === 'count' && !positive(value)) return false;
    if (key === 'mode' && !oneOf('new', 'pair', 'repair', 'replace')(value)) return false;
    if (key === 'reason' && !(typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value))) return false;
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
  'attractap.reader.pairing_started',
  'attractap.reader.pairing_confirmed',
  'attractap.reader.pairing_failed',
  'attractap.reader.pairing_expired',
  'attractap.reader.revoked',
  'attractap.reader.replaced',
  'attractap.reader.token_rejected',
  'attractap.reader.handshake_rejected',
];
