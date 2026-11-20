import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Button } from '@heroui/react';
import type { CommissioningSession } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { SummaryField } from './SummaryField';
import type { CommissioningVerificationResult } from './useCommissioningVerification';

/** Read-only recap once commissioning evidence and runtime setup are both verified; nothing here still needs action. */
export function CompletedSessionSummary({
  session,
  verification,
  onConfigure,
}: {
  session: CommissioningSession;
  verification: CommissioningVerificationResult;
  onConfigure?: (controllerId: number) => void;
}) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const { t, tBackendMessage } = useWagoTranslations();
  const controllerId = verification.data?.controllerId ?? session.managementControllerId ?? null;
  return (
    <div className="wg:space-y-4">
      <StatusAlert status="success" title={t('commissioningUI.complete')}>
        {t('commissioningUI.completeDescription', { name: session.controllerName ?? session.hardwareId })}
      </StatusAlert>
      <dl className="wg:grid wg:gap-3 wg:text-sm wg:sm:grid-cols-2">
        <SummaryField label={t('commissioningUI.hardwareId')} value={session.hardwareId} />
        <SummaryField label={t('commissioningUI.firmware')} value={session.firmwareBaseline} />
        <SummaryField label={t('commissioningUI.claimed')} value={formatDateTime(session.updatedAt)} />
        <SummaryField
          label={t('commissioningUI.management')}
          value={tBackendMessage(verification.data?.managementHardening ?? t('commissioningUI.unverified'))}
        />
      </dl>
      {onConfigure && controllerId && (
        <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
      )}
    </div>
  );
}
