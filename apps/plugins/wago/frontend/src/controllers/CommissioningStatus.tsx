import type { CommissioningSession } from '../api/client';
import { useCommissioningVerification } from '../commissioning/status/useCommissioningVerification';
import { useWagoTranslations } from '../i18n';
import { commissioningLabel } from './commissioningLabel';

export function CommissioningStatus({
  session,
  runtimeUpdate = false,
}: {
  session: CommissioningSession;
  runtimeUpdate?: boolean;
}) {
  const { t } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const label = verification.enrollmentComplete
    ? runtimeUpdate
      ? t('controllers.runtimeUpdatePending')
      : verification.runtimeVerified
        ? t('controllers.verified')
        : t('controllers.pending')
    : verification.unavailable
      ? t('controllers.unavailable')
      : commissioningLabel(session.state, t);
  return <span className="wg:mt-1 wg:text-xs wg:text-primary">{label}</span>;
}
