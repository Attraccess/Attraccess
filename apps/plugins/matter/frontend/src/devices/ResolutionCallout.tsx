import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { useMatterTranslations } from '../i18n';
import type { MatterNodeSummary } from './api';

/** The reasons the backend reports (`DetachedReason`); a newer backend's unknown reason shows no reason text. */
const KNOWN_REASONS = new Set(['absent_from_sidecar', 'fabric_mismatch', 'fabric_absent']);

/** Says why an unclaimed or detached device is not usable yet and what resolves it. Nothing for other states. */
export function ResolutionCallout({
  node,
}: Readonly<{ node: Pick<MatterNodeSummary, 'lifecycleState' | 'detachedReason'> }>) {
  const { t } = useMatterTranslations();
  if (node.lifecycleState === 'unclaimed') {
    return (
      <StatusAlert status="warning" title={t('devices.callout.unclaimed.title')} data-cy="matter-callout-unclaimed">
        {t('devices.callout.unclaimed.text')}
      </StatusAlert>
    );
  }
  if (node.lifecycleState === 'detached') {
    const reason = node.detachedReason ?? 'absent_from_sidecar';
    return (
      <StatusAlert status="danger" title={t('devices.callout.detached.title')} data-cy="matter-callout-detached">
        {t('devices.callout.detached.text')}
        {KNOWN_REASONS.has(reason) && ` ${t(`devices.callout.detached.reason.${reason}`)}`}
      </StatusAlert>
    );
  }
  return null;
}
