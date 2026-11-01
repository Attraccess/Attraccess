import { Button } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useClearReaderUiAlert, useReaderUiAlerts } from './readerUiApi';
import en from './en.json';
import de from './de.json';

/** Open circuit-breaker, load-failure and crash-loop alerts; `readerId` narrows the list to one reader. */
export function ReaderUiAlerts({ readerId }: Readonly<{ readerId?: number }>) {
  const { t } = useTranslations({ en, de });
  const { data } = useReaderUiAlerts();
  const clear = useClearReaderUiAlert();
  const alerts = (data ?? []).filter((alert) => readerId === undefined || alert.readerId === readerId);

  return (
    <div className="flex flex-col gap-2" data-cy="reader-ui-alerts">
      <h3 className="font-semibold">{t('alerts.title')}</h3>
      {alerts.length === 0 && <p className="text-muted">{t('alerts.none')}</p>}
      {alerts.map((alert) => (
        <div key={alert.id} className="flex items-center justify-between gap-3" data-cy={`reader-ui-alert-${alert.id}`}>
          <div className="flex flex-col">
            <span>{t(`alerts.kind.${alert.kind}`)}</span>
            <span className="text-sm text-muted">{[alert.plugin, alert.message].filter(Boolean).join(': ')}</span>
          </div>
          <Button size="sm" variant="secondary" onPress={() => clear.mutate(alert.id)} isPending={clear.isPending}>
            {t('alerts.clear')}
          </Button>
        </div>
      ))}
    </div>
  );
}
