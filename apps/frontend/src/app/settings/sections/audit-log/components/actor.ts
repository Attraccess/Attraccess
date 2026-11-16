import { AuditEntryDto } from '@attraccess/react-query-client';
import { Translate } from './Translate';

export function actor(entry: AuditEntryDto, t: Translate) {
  return entry.actorUsername
    ? `${entry.actorUsername}${entry.actorUsernameSource === 'current' ? ` (${t('currentNameShort')})` : ''}`
    : entry.actorId === null
      ? t('unknownActor')
      : `#${entry.actorId}`;
}
