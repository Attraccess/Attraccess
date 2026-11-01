import { AttractapAuditEvent } from './domain-events';
import { dataFields, oneOf, positive } from './projection';
export const attractapDetails: Record<AttractapAuditEvent['action'], ReadonlySet<string>> = {
  'reader.registered': new Set(['source']),
  'reader.deregistered': new Set(['source']),
  'card.linked': new Set(['readerId', 'source']),
  'card.unlinked': new Set(['readerId', 'source']),
  'reader.crash_reported': new Set(['source', 'resetReason', 'hasCoredump']),
  'reader.enrolled': new Set(['method']),
  'reader.pairing_confirmed': new Set(['mode', 'method']),
  'reader.pairing_failed': new Set(['reason']),
  'reader.pairing_expired': new Set(['reason']),
  'reader.revoked': new Set(['reason']),
  'reader.replaced': new Set(['mode']),
  'reader.token_rejected': new Set(['reason']),
  'reader.handshake_rejected': new Set(['reason', 'count']),
  'ui.hook_decision': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.step_issued': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.step_answered': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.step_expired': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.step_cancelled': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.no_screen_policy_applied': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'policy',
  ]),
  'ui.card_confirm_cancelled': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
  ]),
  'ui.fail_open_used': new Set([
    'plugin',
    'readerId',
    'userId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
  ]),
  'ui.breaker_changed': new Set(['plugin', 'state', 'reasonCode']),
  'ui.alert_changed': new Set(['plugin', 'kind', 'state', 'readerId']),
  'ui.setting_changed': new Set(['setting', 'resourceId', 'readerId', 'plugin', 'value']),
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
type DetailValue = string | number | boolean;

const detailValidators: Record<string, (value: DetailValue) => boolean> = {
  source: oneOf('reader-websocket', 'admin-api', 'reader-enrollment', 'reader-reset'),
  resetReason: (value) => attractapResetReasons.has(value as string),
  hasCoredump: (value) => typeof value === 'boolean',
  readerId: positive,
  count: positive,
  mode: oneOf('new', 'pair', 'takeover'),
  method: oneOf('code', 'led-pattern', 'flasher'),
  plugin: (value) => typeof value === 'string' && /^[A-Za-z0-9._@/-]{1,100}$/.test(value),
  userId: positive,
  resourceId: positive,
  decision: oneOf('allow', 'confirm', 'block', 'answered', 'cancelled', 'expired', 'default', 'failure'),
  reasonCode: (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value),
  cardSessionId: (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value),
  origin: oneOf('web', 'api', 'reader', 'supervision'),
  policy: oneOf('block', 'card-confirm', 'allow-with-warning'),
  state: oneOf('open', 'closed', 'reset', 'probe', 'created', 'cleared', 'half-open'),
  kind: oneOf('breaker-open', 'load-failure', 'crash-loop'),
  setting: oneOf('noScreenPolicy', 'widgetsEnabled', 'hookFailurePolicy', 'readerWidgetsEnabled'),
  value: (value) => typeof value === 'string' || typeof value === 'boolean',
  reason: (value) => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value),
};

export function validAttractapDetails(
  action: AttractapAuditEvent['action'],
  details: Record<string, unknown>,
): boolean {
  return Object.entries(details).every(
    ([key, value]) =>
      attractapDetails[action].has(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      (detailValidators[key]?.(value) ?? true),
  );
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
  if (
    input.subjectType !== undefined &&
    !oneOf('attractap.reader', 'resource', 'attractap.ui-alert')(input.subjectType)
  )
    return null;
  return { ...input, details: details as Record<string, string | number | boolean> };
}

export const ATTRACTAP_AUDIT_ACTIONS = [
  'attractap.reader.registered',
  'attractap.reader.deregistered',
  'attractap.card.linked',
  'attractap.card.unlinked',
  'attractap.reader.crash_reported',
  'attractap.reader.enrolled',
  'attractap.reader.pairing_confirmed',
  'attractap.reader.pairing_failed',
  'attractap.reader.pairing_expired',
  'attractap.reader.revoked',
  'attractap.reader.replaced',
  'attractap.reader.token_rejected',
  'attractap.reader.handshake_rejected',
  'attractap.ui.hook_decision',
  'attractap.ui.step_issued',
  'attractap.ui.step_answered',
  'attractap.ui.step_expired',
  'attractap.ui.step_cancelled',
  'attractap.ui.no_screen_policy_applied',
  'attractap.ui.card_confirm_cancelled',
  'attractap.ui.fail_open_used',
  'attractap.ui.breaker_changed',
  'attractap.ui.alert_changed',
  'attractap.ui.setting_changed',
];
