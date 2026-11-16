import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { usePluginsServiceGetPluginSystemStatus, usePluginsServiceRetryPlugin } from '@attraccess/react-query-client';
import { useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { getServerInstanceId, waitForServerRestart } from './serverRestart';
import type { FailedPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  failedPlugin: FailedPlugin | null;
  onClose: () => void;
}

export function PluginErrorModal({ failedPlugin, onClose }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { refetch: refetchPluginSystemStatus } = usePluginsServiceGetPluginSystemStatus();
  const { mutateAsync: retryFailedPlugin } = usePluginsServiceRetryPlugin();
  const [isRetrying, setIsRetrying] = useState(false);

  const retryPlugin = async () => {
    if (!failedPlugin) return;

    setIsRetrying(true);
    try {
      const getPluginSystemStatus = async () => (await refetchPluginSystemStatus()).data;
      const previousInstanceId = await getServerInstanceId(getPluginSystemStatus);
      await retryFailedPlugin({ pluginId: failedPlugin.id });
      toast.success({ title: t('status.retrySuccess') });
      await waitForServerRestart(previousInstanceId, getPluginSystemStatus);
      window.location.reload();
      onClose();
    } catch {
      toast.error({ title: t('status.retryError') });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <StatusDialog
      isOpen={failedPlugin !== null}
      onClose={onClose}
      status="error"
      title={t('status.errorTitle', { pluginName: failedPlugin?.name ?? '' })}
      closeLabel={t('status.close')}
      action={{
        label: t('status.retry'),
        onPress: retryPlugin,
        isPending: isRetrying,
        'data-cy': 'plugins-list-retry-load-button',
      }}
      data-cy="plugins-list-load-error-modal"
    >
      <p className="text-sm text-muted">{t('status.errorDescription')}</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-medium border border-divider p-3 text-sm text-danger">
        {failedPlugin?.error}
      </pre>
    </StatusDialog>
  );
}
