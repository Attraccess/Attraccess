import { SsoAuditEvent } from './audit-domain-event.types';
import { dataFields, positive, uuid } from './audit-projection';
import { ssoActions, validSsoDetails } from './audit-sso-details';

export function projectSsoAuditEvent(input: unknown): SsoAuditEvent | null {
  const event = dataFields(input, [
    'action',
    'operationId',
    'actorId',
    'authenticationMethod',
    'apiTokenId',
    'subject',
    'details',
  ]);
  if (!event || !ssoActions.has(event.action as string) || !uuid(event.operationId)) return null;
  if (event.actorId === null) {
    if (event.authenticationMethod !== null || event.apiTokenId !== undefined) return null;
  } else if (
    !positive(event.actorId) ||
    (event.authenticationMethod !== 'session' && event.authenticationMethod !== 'api-token')
  ) {
    return null;
  }
  if (event.authenticationMethod === 'api-token' ? !positive(event.apiTokenId) : event.apiTokenId !== undefined)
    return null;
  const providerLifecycle = (event.action as string).startsWith('sso.provider.');
  if (providerLifecycle ? event.actorId === null : event.actorId !== null) return null;
  const subject = dataFields(event.subject, ['type', 'id']);
  const details = dataFields(event.details, ['before', 'after', 'provider', 'changes']);
  if (!subject || !positive(subject.id) || (subject.type !== 'sso.provider' && subject.type !== 'user') || !details)
    return null;
  if (
    Object.values(details).some((value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 1800) ||
    Buffer.byteLength(JSON.stringify(details), 'utf8') > 4096
  )
    return null;
  if (!validSsoDetails(event, subject, details)) return null;
  return {
    action: event.action as string,
    operationId: event.operationId as string,
    actorId: event.actorId as number | null,
    authenticationMethod: event.authenticationMethod as SsoAuditEvent['authenticationMethod'],
    ...(event.apiTokenId === undefined ? {} : { apiTokenId: event.apiTokenId as number }),
    subject: { type: subject.type as 'sso.provider' | 'user', id: subject.id as number },
    details: details as Record<string, string>,
  };
}
