import { Alert, Button, Input, Skeleton } from '@heroui/react';
import { QRCode } from 'react-qrcode-logo';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import {
  TwoFactorSetupResponseDto,
  useAuthenticationServiceDisableTwoFactor,
  useAuthenticationServiceGetTwoFactorStatus,
  useAuthenticationServiceSetupTwoFactor,
  useAuthenticationServiceVerifyTwoFactor,
} from '@attraccess/react-query-client';

import en from './en.json';
import de from './de.json';

export function TwoFactorCard() {
  const { t } = useTranslations({ en, de });
  const { showToast } = useToastMessage();
  const { data: status, isLoading, refetch } = useAuthenticationServiceGetTwoFactorStatus();

  const [setupData, setSetupData] = useState<TwoFactorSetupResponseDto | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const { mutateAsync: startSetup, isPending: isSettingUp } = useAuthenticationServiceSetupTwoFactor();
  const { mutateAsync: verifySetup, isPending: isVerifying } = useAuthenticationServiceVerifyTwoFactor();
  const { mutateAsync: disableTwoFactor, isPending: isDisabling } = useAuthenticationServiceDisableTwoFactor();

  const refreshStatus = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleStartSetup = useCallback(async () => {
    try {
      const response = await startSetup();
      setSetupData(response);
      setSetupCode('');
    } catch (error) {
      console.error('Failed to start 2FA setup', error);
      showToast({ title: t('errors.setupFailed'), type: 'error' });
    }
  }, [startSetup, showToast, t]);

  const handleVerify = useCallback(async () => {
    if (!setupCode.trim()) {
      return;
    }

    try {
      await verifySetup({ requestBody: { code: setupCode.trim() } });
      setSetupData(null);
      setSetupCode('');
      await refreshStatus();
      showToast({ title: t('success.enabled'), type: 'success' });
    } catch (error) {
      console.error('Failed to verify 2FA setup', error);
      showToast({ title: t('errors.verifyFailed'), type: 'error' });
    }
  }, [refreshStatus, setupCode, showToast, t, verifySetup]);

  const handleDisable = useCallback(async () => {
    if (!disableCode.trim()) {
      return;
    }

    try {
      await disableTwoFactor({ requestBody: { code: disableCode.trim() } });
      setDisableCode('');
      await refreshStatus();
      showToast({ title: t('success.disabled'), type: 'success' });
    } catch (error) {
      console.error('Failed to disable 2FA', error);
      showToast({ title: t('errors.disableFailed'), type: 'error' });
    }
  }, [disableCode, disableTwoFactor, refreshStatus, showToast, t]);

  const isBusy = isSettingUp || isVerifying || isDisabling;
  const showSetup = !status?.enabled;
  const shouldShowSetupDetails = showSetup && setupData;

  const policyWarning = useMemo(() => {
    if (!status?.required || status.enabled) {
      return null;
    }
    return t('policy.requiredWarning');
  }, [status?.enabled, status?.required, t]);

  if (isLoading) {
    return <Skeleton className="w-full h-10" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium">{t('status.label')}</div>
        <div className="text-sm text-default-500">{status?.enabled ? t('status.enabled') : t('status.disabled')}</div>
      </div>

      {policyWarning && <Alert color="warning" title={t('policy.title')} description={policyWarning} />}

      {showSetup && (
        <div className="flex flex-col gap-4">
          <Button onPress={handleStartSetup} isLoading={isSettingUp} isDisabled={isBusy}>
            {setupData ? t('setup.regenerateButton') : t('setup.startButton')}
          </Button>

          {shouldShowSetupDetails && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2">
                <QRCode value={setupData.otpauthUrl} size={200} />
                <div className="text-xs text-default-500">{t('setup.scanHint')}</div>
              </div>

              <Input
                label={t('setup.secretLabel')}
                value={setupData.secret}
                readOnly
                variant="bordered"
                description={t('setup.secretHint')}
              />

              <Input
                label={t('setup.codeLabel')}
                value={setupCode}
                onValueChange={setSetupCode}
                variant="bordered"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                isDisabled={isBusy}
              />

              <Button onPress={handleVerify} isLoading={isVerifying} isDisabled={isBusy || !setupCode.trim()}>
                {t('setup.verifyButton')}
              </Button>
            </div>
          )}
        </div>
      )}

      {!showSetup && (
        <div className="flex flex-col gap-4">
          <Input
            label={t('disable.codeLabel')}
            value={disableCode}
            onValueChange={setDisableCode}
            variant="bordered"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            isDisabled={isBusy}
          />
          <Button color="danger" onPress={handleDisable} isLoading={isDisabling} isDisabled={isBusy || !disableCode.trim()}>
            {t('disable.button')}
          </Button>
        </div>
      )}
    </div>
  );
}
