import { Chip } from '@heroui/react';
import type { CommissioningSession, RuntimeUpdateStatus, WagoController } from '../api/client';
import { useCommissioningVerification } from '../commissioning/status/useCommissioningVerification';
import { useWagoTranslations } from '../i18n';

export function ControllerStatus({
  controller,
  session,
  status,
  unavailable,
}: {
  controller: WagoController;
  session: CommissioningSession | null;
  status?: RuntimeUpdateStatus;
  unavailable: boolean;
}) {
  const { t } = useWagoTranslations();
  const checkingEnrollment = session?.state === 'awaiting_verification';
  const verification = useCommissioningVerification(checkingEnrollment ? session : { id: 0, state: 'revoked' });
  const imageMismatch = !!(
    status?.runtime?.runningImageId &&
    status.runtime.desiredImageId &&
    status.runtime.runningImageId !== status.runtime.desiredImageId
  );
  const updating = controller.connectivity === 'runtime_update' || status?.runtimeUpdateRequired || imageMismatch;
  let label = t(`connectivity.${controller.connectivity}`);
  let color: 'success' | 'warning' | 'danger' | 'default' =
    controller.connectivity === 'online'
      ? 'success'
      : ['stale', 'runtime_check'].includes(controller.connectivity)
        ? 'warning'
        : 'default';
  if (controller.trustState !== 'claimed') {
    label = t(session ? 'controllers.enrolling' : 'connectivity.untrusted');
    color = 'warning';
  } else if (controller.connectivity === 'stale' || controller.connectivity === 'runtime_check') {
    label = t(`connectivity.${controller.connectivity}`);
  } else if (updating) {
    label = t('connectivity.runtime_update');
    color = 'warning';
  } else if (controller.connectivity !== 'online') {
    label = t(`connectivity.${controller.connectivity}`);
  } else if (unavailable || verification.unavailable) {
    label = t('controllers.unavailable');
    color = 'warning';
  } else if (
    controller.compatibilityError ||
    status?.blocker ||
    status?.update?.failure ||
    ['recovery_required', 'reenrol_required'].includes(status?.management ?? '')
  ) {
    label = t('controllers.attention');
    color = 'warning';
  } else if (
    ['pending', 'verified'].includes(status?.management ?? '') ||
    (checkingEnrollment && (!verification.enrollmentComplete || !verification.runtimeVerified))
  ) {
    label = t('controllers.setupPending');
    color = 'warning';
  }
  return (
    <div className="wg:space-y-1">
      <Chip size="sm" variant="soft" color={color}>
        {label}
      </Chip>
    </div>
  );
}
