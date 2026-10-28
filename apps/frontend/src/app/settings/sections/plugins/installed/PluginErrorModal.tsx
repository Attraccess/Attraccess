import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  'failedPlugin' | 'setFailedPlugin' | 't' | 'retryPlugin' | 'isRetryingPlugin'
>;
export function PluginErrorModal({ failedPlugin, setFailedPlugin, t, retryPlugin, isRetryingPlugin }: Props) {
  return (
    <StatusDialog
      isOpen={failedPlugin !== null}
      onClose={() => setFailedPlugin(null)}
      status="error"
      title={t('status.errorTitle', { pluginName: failedPlugin?.name ?? '' })}
      closeLabel={t('status.close')}
      action={{
        label: t('status.retry'),
        onPress: retryPlugin,
        isPending: isRetryingPlugin,
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
