import { AuditEntryDto } from '@attraccess/react-query-client';
import { TFunction } from '@attraccess/plugins-frontend-ui';

export function actor(entry: AuditEntryDto, t: TFunction) {
  return entry.actorUsername
    ? `${entry.actorUsername}${entry.actorUsernameSource === 'current' ? ` (${t('currentNameShort')})` : ''}`
    : entry.actorId === null
      ? t('unknownActor')
      : `#${entry.actorId}`;
}
