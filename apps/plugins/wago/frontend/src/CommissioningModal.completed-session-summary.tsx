import { Alert, Button } from '@heroui/react';
import { CommissioningSession } from './api';
import { useCommissioningVerification } from './useCommissioningVerification';
import { useWagoTranslations } from './i18n';
import { SummaryField } from './CommissioningModal.summary-field';

export /** Read-only recap once commissioning evidence and runtime setup are both verified; nothing here still needs action. */
function CompletedSessionSummary({
  session,
  verification,
  onConfigure,
}: {
  session: CommissioningSession;
  verification: ReturnType<typeof useCommissioningVerification>;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const controllerId = verification.data?.controllerId ?? session.managementControllerId ?? null;
  return (
    <div className="wg:space-y-4">
      <Alert status="success">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.complete')}</Alert.Title>
          <Alert.Description>
            {t('commissioningUI.completeDescription', { name: session.controllerName ?? session.hardwareId })}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <dl className="wg:grid wg:gap-3 wg:text-sm wg:sm:grid-cols-2">
        <SummaryField label={t('commissioningUI.hardwareId')} value={session.hardwareId} />
        <SummaryField label={t('commissioningUI.firmware')} value={session.firmwareBaseline} />
        <SummaryField
          label={t('commissioningUI.claimed')}
          value={new Date(session.updatedAt).toLocaleString(language)}
        />
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
