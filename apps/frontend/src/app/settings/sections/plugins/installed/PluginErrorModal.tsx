import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useGetPluginSystemStatus, useRetryPlugin } from '@attraccess/react-query-client';
import { useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import { getServerInstanceId, waitForServerRestart } from './serverRestart';
import type { FailedPlugin } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  failedPlugin: FailedPlugin | null;
  onClose: () => void;
  /** Opens the removal of a refused plugin, which cannot be retried. */
  onRemove: (pluginId: string) => void;
}

/**
 * The server error of a plugin. A plugin that failed to load can be retried; a refused one (for example built for SDK
 * 1.x) never loads, so the dialog explains that and offers to remove it instead.
 */
export function PluginErrorModal({ failedPlugin, onClose, onRemove }: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const { refetch: refetchPluginSystemStatus } = useGetPluginSystemStatus();
  const { mutateAsync: retryFailedPlugin } = useRetryPlugin();
  const [isRetrying, setIsRetrying] = useState(false);

  const retryPlugin = async () => {
    if (!failedPlugin) return;

    setIsRetrying(true);
    try {
      const getPluginSystemStatus = async () => (await refetchPluginSystemStatus()).data;
      const previousInstanceId = await getServerInstanceId(getPluginSystemStatus);
      await retryFailedPlugin({ path: { pluginId: failedPlugin.id } });
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

  const refused = failedPlugin?.refused === true;
  const pluginName = failedPlugin?.name ?? '';
  const action = refused
    ? {
        label: t('status.remove'),
        onPress: () => failedPlugin && onRemove(failedPlugin.id),
        'data-cy': 'plugins-list-remove-refused-button',
      }
    : {
        label: t('status.retry'),
        onPress: retryPlugin,
        isPending: isRetrying,
        'data-cy': 'plugins-list-retry-load-button',
      };

  return (
    <StatusDialog
      isOpen={failedPlugin !== null}
      onClose={onClose}
      status="error"
      title={t(refused ? 'status.refusedTitle' : 'status.errorTitle', { pluginName })}
      closeLabel={t('status.close')}
      action={action}
      data-cy="plugins-list-load-error-modal"
    >
      <p className="text-sm text-muted">{t(refused ? 'status.refusedDescription' : 'status.errorDescription')}</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-medium border border-divider p-3 text-sm text-danger">
        {failedPlugin?.error}
      </pre>
    </StatusDialog>
  );
}
