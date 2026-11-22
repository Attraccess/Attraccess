import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { MatterNodeSummary } from './api';

/** Says how a removed device left: removed from the Attraccess fabric, or forgotten here only. Nothing for other states. */
export function RemovedNotice({
  node,
}: Readonly<{ node: Pick<MatterNodeSummary, 'lifecycleState' | 'removalReason'> }>) {
  const { t, tExists } = useMatterTranslations();
  if (node.lifecycleState !== 'removed') return null;
  const reason = node.removalReason ?? '';
  const key = `devices.removed.${reason}`;
  const known = tExists(`${key}.title`);
  return (
    <StatusAlert
      status={reason === 'forced_from_fabric' ? 'warning' : 'accent'}
      title={known ? t(`${key}.title`) : t('devices.removed.generic.title')}
      data-cy="matter-removed-notice"
    >
      {known ? t(`${key}.text`) : t('devices.removed.generic.text')}
    </StatusAlert>
  );
}
