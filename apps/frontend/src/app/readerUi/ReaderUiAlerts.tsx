import { Alert, AlertContent, AlertDescription, AlertTitle, Button } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAttractapServiceGetReaders } from '@attraccess/react-query-client';
import { useToastMessage } from '../../components/toastProvider';
import { useClearReaderUiAlert, useReaderUiAlerts, type ReaderUiAlert } from './readerUiApi';
import en from './en.json';
import de from './de.json';

const ALERT_STATUS: Record<string, 'warning' | 'danger'> = {
  'breaker-open': 'warning',
  // The plugin's start hooks are not enforced at all while it is not loaded.
  'load-failure': 'danger',
  'crash-loop': 'warning',
};

/** One alert with its own Clear action, so clearing one alert doesn't mark the others as pending. */
function AlertRow({ alert, readerName }: Readonly<{ alert: ReaderUiAlert; readerName?: string }>) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const clear = useClearReaderUiAlert();
  const onClear = () => clear.mutate(alert.id, { onError: () => toast.error({ title: t('alerts.clearError') }) });
  // Built from kind, plugin and reader; the server message is English and repeats the plugin name.
  const description = t(`alerts.description.${alert.kind}`, {
    plugin: alert.plugin ?? '',
    reader: readerName ?? t('alerts.readerFallback', { id: alert.readerId ?? '' }),
  });

  return (
    <Alert status={ALERT_STATUS[alert.kind] ?? 'warning'} data-cy={`reader-ui-alert-${alert.id}`}>
      <Alert.Indicator />
      <AlertContent>
        <AlertTitle>{t(`alerts.kind.${alert.kind}`)}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </AlertContent>
      <Button size="sm" variant="secondary" onPress={onClear} isPending={clear.isPending}>
        {t('alerts.clear')}
      </Button>
    </Alert>
  );
}

/** Open circuit-breaker, load-failure and crash-loop alerts; `readerId` narrows the list to one reader. */
export function ReaderUiAlerts({ readerId }: Readonly<{ readerId?: number }>) {
  const { t } = useTranslations({ en, de });
  const { data } = useReaderUiAlerts();
  const alerts = (data ?? []).filter((alert) => readerId === undefined || alert.readerId === readerId);
  const needsReaders = alerts.some((alert) => alert.readerId !== null);
  const { data: readers } = useAttractapServiceGetReaders(undefined, { enabled: needsReaders });
  const readerName = (id: number | null) => readers?.find((reader) => reader.id === id)?.name;

  return (
    <div className="flex flex-col gap-2" data-cy="reader-ui-alerts">
      <h3 className="font-semibold">{t('alerts.title')}</h3>
      {alerts.length === 0 && <p className="text-muted">{t('alerts.none')}</p>}
      {alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} readerName={readerName(alert.readerId)} />
      ))}
    </div>
  );
}
