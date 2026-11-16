import { Button } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../i18n';

interface NetworkChangeCredentialRetirementProps {
  isDisabled: boolean;
  onRetire: () => void;
  showActionError: boolean;
}

/** Offers to retire the MQTT credentials a completed network change left behind. */
export function NetworkChangeCredentialRetirement({
  isDisabled,
  onRetire,
  showActionError,
}: NetworkChangeCredentialRetirementProps) {
  const { t } = useWagoTranslations();
  return (
    <>
      <p>{t('networkChange.retirementDescription')}</p>
      <Button variant="secondary" isDisabled={isDisabled} onPress={onRetire}>
        {t('networkChange.retire')}
      </Button>
      {showActionError && <p role="alert">{t('networkChange.actionFailed')}</p>}
    </>
  );
}
