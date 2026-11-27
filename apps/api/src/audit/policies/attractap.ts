import { dataFields, oneOf, positive, printable, isAuthenticationMethod } from './projection';
import type { AuthenticationMethod } from '@attraccess/application-models';

/** Projection input: the attractap action without its `attractap.` prefix. */
export interface AttractapAuditInput {
  action: AttractapAuditAction;
  /** Defaults to attractap.reader. `ui.*` events may use the resource or an alert as subject. */
  subjectType?:
    'attractap.reader' | 'attractap.installation' | 'resource' | 'attractap.ui-alert' | 'attractap.plugin-reader';
  actorId: number | null;
  authenticationMethod: AuthenticationMethod | null;
  apiTokenId?: number;
  subjectId: number;
  details: Record<string, string | number | boolean>;
}

export const attractapDetails = {
  'reader.registered': new Set(['source']),
  'reader.deregistered': new Set(['source']),
  // A card check on a plugin's own device names the plugin instead of a reader.
  'card.linked': new Set(['readerId', 'pluginId', 'source', 'cardType']),
  'card.unlinked': new Set(['readerId', 'pluginId', 'source']),
  'reader.crash_reported': new Set(['source', 'resetReason', 'hasCoredump']),
  'reader.enrolled': new Set(['method']),
  'reader.pairing_confirmed': new Set(['mode', 'method']),
  'reader.pairing_failed': new Set(['reason']),
  'reader.pairing_expired': new Set(['reason']),
  'reader.revoked': new Set(['reason']),
  'reader.replaced': new Set(['mode']),
  // No longer written since token sign-in was removed (ATT-1207); kept so that existing audit entries still render.
  'reader.token_rejected': new Set(['reason']),
  'reader.handshake_rejected': new Set(['reason', 'count']),
  'reader.secure_keys_created': new Set(['signingFingerprint', 'recoveryFingerprint']),
  'reader.recovery_key_downloaded': new Set(['recoveryFingerprint']),
  'reader.recovery_key_verified': new Set(['recoveryFingerprint']),
  'reader.signing_key_backup_downloaded': new Set(['signingFingerprint']),
  'reader.secure_keys_restored': new Set(['signingFingerprint', 'recoveryFingerprint', 'source']),
  // "Secure this reader" (ATT-1208): ids, states, reason codes, public digests and versions only.
  'reader.secure_conversion_started': new Set([
    'conversionId',
    'conversionState',
    'targetVersion',
    'signingFingerprint',
    'recoveryFingerprint',
  ]),
  'reader.secure_conversion_preflight': new Set(['conversionId', 'conversionState', 'ok', 'failedChecks']),
  'reader.secure_conversion_digests_burned': new Set(['conversionId', 'conversionState', 'digest0', 'digest1']),
  'reader.secure_conversion_failed': new Set(['conversionId', 'conversionState', 'reason']),
  'reader.secure_conversion_interrupted': new Set(['conversionId', 'conversionState']),
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
    'origin',
    'policy',
  ]),
  'ui.card_confirm_cancelled': new Set([
    'plugin',
    'readerId',
    'userId',
    'tappedUserId',
    'resourceId',
    'decision',
    'reasonCode',
    'cardSessionId',
    'origin',
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
  // A card held to a plugin's own reader; the subject is the plugin reader.
  'plugin_reader.tapped': new Set([
    'pluginId',
    'deviceId',
    'subjectLabel',
    'result',
    'resourceId',
    'cardId',
    'userId',
    'reasonCode',
  ]),
} satisfies Record<string, ReadonlySet<string>>;

export type AttractapAuditAction = keyof typeof attractapDetails;
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

function isSha256Hex(value: DetailValue): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

const detailValidators: Record<string, (value: DetailValue) => boolean> = {
  source: oneOf(
    'reader-websocket',
    'admin-api',
    'reader-enrollment',
    'reader-reset',
    'uid-only-delete',
    'reader-recovery',
    'plugin-recovery',
    'signing-backup',
    'recovery-file',
  ),
  signingFingerprint: isSha256Hex,
  recoveryFingerprint: isSha256Hex,
  cardType: oneOf('uid-only'),
  resetReason: (value) => attractapResetReasons.has(value as string),
  hasCoredump: (value) => typeof value === 'boolean',
  readerId: positive,
  pluginId: (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{21}$/.test(value),
  count: positive,
  // The server no longer writes `pair` (pairing a token reader, removed in ATT-1207); kept for existing audit entries.
  mode: oneOf('new', 'pair', 'takeover'),
  method: oneOf('code', 'led-pattern', 'flasher'),
  // Manifest names are free strings (npm names incl. `@scope/name`); only control characters are refused.
  plugin: (value) => printable(value, 214),
  userId: positive,
  tappedUserId: positive,
  cardId: positive,
  deviceId: (value) => printable(value, 200),
  subjectLabel: (value) => printable(value, 100),
  result: oneOf('accepted', 'refused'),
  resourceId: positive,
  decision: oneOf('allow', 'confirm', 'block', 'answered', 'cancelled', 'expired', 'default', 'failure'),
  reasonCode: (value) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value),
  cardSessionId: (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value),
  origin: oneOf('web', 'api', 'reader', 'supervision'),
  policy: oneOf('block', 'card-confirm', 'allow-with-warning'),
  state: oneOf('open', 'closed', 'reset', 'probe', 'created', 'cleared', 'half-open'),
  kind: oneOf('breaker-open', 'load-failure', 'crash-loop', 'time-zone-conflict'),
  setting: oneOf('noScreenPolicy', 'widgetsEnabled', 'hookFailurePolicy', 'readerWidgetsEnabled'),
  value: (value) => typeof value === 'string' || typeof value === 'boolean',
  reason: (value) => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value),
  conversionId: positive,
  conversionState: (value) => typeof value === 'string' && /^[a-z-]{1,24}$/.test(value),
  targetVersion: (value) => printable(value, 32),
  digest0: (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
  digest1: (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
  ok: (value) => typeof value === 'boolean',
  failedChecks: (value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 32,
};

export function validAttractapDetails(action: AttractapAuditAction, details: Record<string, unknown>): boolean {
  return Object.entries(details).every(
    ([key, value]) =>
      (attractapDetails[action] as ReadonlySet<string>).has(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      (detailValidators[key]?.(value) ?? true),
  );
}

export function projectAttractapAuditEvent(input: AttractapAuditInput): AttractapAuditInput | null {
  if (!positive(input.subjectId) || !attractapDetails[input.action]) return null;
  const deviceActor = input.authenticationMethod === null;
  if (deviceActor ? input.actorId !== null || input.apiTokenId !== undefined : !positive(input.actorId)) return null;
  if (!deviceActor && !isAuthenticationMethod(input.authenticationMethod)) return null;
  if (input.authenticationMethod === 'api-token' ? !positive(input.apiTokenId) : input.apiTokenId !== undefined)
    return null;
  const details = dataFields(input.details, [...attractapDetails[input.action]]);
  if (!details) return null;
  if (!validAttractapDetails(input.action, details)) return null;
  if (Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096) return null;
  if (
    input.subjectType !== undefined &&
    !oneOf(
      'attractap.reader',
      'attractap.installation',
      'resource',
      'attractap.ui-alert',
      'attractap.plugin-reader',
    )(input.subjectType)
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
  // No longer written (ATT-1207); kept so that existing audit entries still render.
  'attractap.reader.token_rejected',
  'attractap.reader.handshake_rejected',
  'attractap.reader.secure_keys_created',
  'attractap.reader.recovery_key_downloaded',
  'attractap.reader.recovery_key_verified',
  'attractap.reader.signing_key_backup_downloaded',
  'attractap.reader.secure_keys_restored',
  'attractap.reader.secure_conversion_started',
  'attractap.reader.secure_conversion_preflight',
  'attractap.reader.secure_conversion_digests_burned',
  'attractap.reader.secure_conversion_failed',
  'attractap.reader.secure_conversion_interrupted',
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
  'attractap.plugin_reader.tapped',
] as const satisfies readonly `attractap.${AttractapAuditAction}`[];
