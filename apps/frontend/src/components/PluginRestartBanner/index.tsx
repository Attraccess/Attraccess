import { useState } from 'react';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@heroui/react';
import { AlertStatusIcon, ConfirmableButton, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetPluginSystemStatus, useRestartPluginSystem } from '@attraccess/react-query-client';
import { RotateCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToastMessage } from '../toastProvider';
import { reloadPage } from '../../utils/reloadPage';
import { getServerInstanceId, waitForServerRestart } from './serverRestart';
import en from './en.json';
import de from './de.json';

/** How often an open page asks whether plugin changes wait for a restart (other admins, other tabs). */
export const PLUGIN_RESTART_STATUS_INTERVAL_MS = 60_000;

/**
 * Tells plugin administrators, on every page, that installed, updated or removed plugins wait for a restart, and
 * restarts the API on request. It stays until the restart happened: it cannot be dismissed.
 */
export function PluginRestartBanner() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const { hasPermission } = useAuth();
  const canManagePlugins = hasPermission('system.plugins.manage');
  const { data: status, refetch } = useGetPluginSystemStatus({}, undefined, {
    enabled: canManagePlugins,
    refetchInterval: PLUGIN_RESTART_STATUS_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const { mutateAsync: requestRestart } = useRestartPluginSystem();
  const [isRestarting, setIsRestarting] = useState(false);

  if (!canManagePlugins || !status?.restartRequired) return null;

  const restart = async () => {
    setIsRestarting(true);
    try {
      const getStatus = async () => (await refetch()).data;
      const previousInstanceId = await getServerInstanceId(getStatus);
      await requestRestart({});
      await waitForServerRestart(previousInstanceId, getStatus);
      reloadPage();
    } catch {
      toast.error({ title: t('restartError'), description: t('restartErrorDescription') });
      setIsRestarting(false);
    }
  };

  return (
    <Alert status="warning" role="status" className="rounded-none" data-cy="plugin-restart-banner">
      <AlertStatusIcon status="warning" />
      <AlertContent>
        <AlertTitle>{t('title')}</AlertTitle>
        <AlertDescription>{t('description')}</AlertDescription>
      </AlertContent>
      <ConfirmableButton
        label={isRestarting ? t('restarting') : t('restartNow')}
        icon={<RotateCw size={16} />}
        status="warning"
        isPending={isRestarting}
        onConfirm={restart}
        confirm={{
          title: t('confirmTitle'),
          message: t('confirmMessage'),
          confirmLabel: t('restartNow'),
          'data-cy': 'plugin-restart-confirm',
          confirmDataCy: 'plugin-restart-confirm-button',
        }}
        data-cy="plugin-restart-button"
      />
    </Alert>
  );
}
