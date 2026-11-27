import { AuditEntryDto } from '@attraccess/react-query-client';
import { auditLabel } from './auditLabel';
import { TFunction } from '@attraccess/plugins-frontend-ui';

export function target(entry: AuditEntryDto, t: TFunction) {
  if (entry.subjectType === 'setting' && typeof entry.details.settingKey === 'string')
    return auditLabel('settingNames', entry.details.settingKey, t);
  // There is one plugin system, so its record number says nothing.
  if (entry.subjectType === 'plugin-system') return auditLabel('targets', entry.subjectType, t);
  return (
    (entry.subjectLabel &&
      `${entry.subjectLabel}${entry.subjectLabelSource === 'current' ? ` (${t('currentNameShort')})` : ''}`) ||
    (entry.subjectId === null ? t('noTarget') : `${auditLabel('targets', entry.subjectType, t)} #${entry.subjectId}`)
  );
}
