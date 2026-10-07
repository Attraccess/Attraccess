import { Alert, AlertContent, AlertDescription, AlertTitle, Input, Label, TextField, cn } from '@heroui/react';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { LabeledSwitch } from '../../../../../components/labeledSwitch';
import { PageHeader } from '../../../../../components/pageHeader';
import { useAttractapSerialConfiguratorApiState } from './useAttractapSerialConfiguratorApiState';

export function AttractapSerialConfiguratorApi({
  openDeviceSettings,
  className,
}: {
  openDeviceSettings: (deviceId: string) => void;
  className?: string;
}) {
  const {
    t,
    isFetchingConfiguration,
    isUpdatingApi,
    showManual,
    setShowManual,
    status,
    apiConnectionData,
    manualHostname,
    setManualHostname,
    manualPort,
    setManualPort,
    manualUseSSL,
    setManualUseSSL,
    apiDataMatchesServer,
    handleOpenDeviceSettings,
    alertDescription,
    alertTitle,
    alertColor,
    handleApplyCurrentServer,
    handleManualSubmit,
    handleRefresh,
  } = useAttractapSerialConfiguratorApiState({ openDeviceSettings, className });

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader
        noMargin
        title={t('title')}
        actions={[
          {
            key: 'refresh-status',
            label: t('actions.refreshStatus'),
            isPending: isFetchingConfiguration || isUpdatingApi,
            onPress: handleRefresh,
          },
        ]}
      />

      <Alert status={alertColor}>
        <AlertContent>
          <AlertTitle>{alertTitle}</AlertTitle>
        </AlertContent>
        {alertDescription}
        {status?.status === 'authenticated' && (
          <Button variant="primary" onPress={handleOpenDeviceSettings}>
            {t('status.authenticated.openDeviceSettings.button')}
          </Button>
        )}
      </Alert>

      {apiDataMatchesServer === false && (
        <Alert status="warning">
          <AlertStatusIcon status="warning" />
          <AlertContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <AlertTitle>{t('apiDataDoesNotMatchesServer.alert.title')}</AlertTitle>
              <AlertDescription>
                {t('apiDataDoesNotMatchesServer.alert.description', {
                  hostname: apiConnectionData.hostname,
                  port: apiConnectionData.port,
                  protocolEmoji: apiConnectionData.useSSL ? '🔒' : '🔓',
                })}
              </AlertDescription>
            </div>
            <Button
              variant="primary"
              onPress={handleApplyCurrentServer}
              isPending={isUpdatingApi}
              className="self-start"
              data-cy="attractap-api-apply-current-server-button"
            >
              {t('apiDataDoesNotMatchesServer.alert.button')}
            </Button>
          </AlertContent>
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-default-200 p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-medium"
          onClick={() => setShowManual((prev) => !prev)}
          data-cy="attractap-api-manual-toggle"
        >
          {t('manual.title')}
          <span className="text-muted">{showManual ? '−' : '+'}</span>
        </button>

        {showManual && (
          <div className="flex flex-col gap-3">
            <TextField value={manualHostname} onChange={setManualHostname}>
              <Label>{t('manual.hostname')}</Label>
              <Input data-cy="attractap-api-manual-hostname" />
            </TextField>
            <TextField value={manualPort} onChange={setManualPort}>
              <Label>{t('manual.port')}</Label>
              <Input inputMode="numeric" data-cy="attractap-api-manual-port" />
            </TextField>
            <LabeledSwitch isSelected={manualUseSSL} onChange={setManualUseSSL} data-cy="attractap-api-manual-ssl">
              {t('manual.useSSL')}
            </LabeledSwitch>
            <Button
              variant="secondary"
              onPress={handleManualSubmit}
              isPending={isUpdatingApi}
              data-cy="attractap-api-manual-submit"
            >
              {t('manual.submit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
