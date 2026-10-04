import { Alert, AlertContent, AlertDescription, AlertTitle, Link } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useResourceMeteringServiceGetResourceMeteringStatus,
  UseResourceMeteringServiceGetResourceMeteringStatusKeyFn,
  useResourceMeteringServiceRetryResourceMeteringSettlement,
  useResourceMeteringServiceWaiveResourceMeteringSettlement,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button } from '../../../../../components/button';
import { useToastMessage } from '../../../../../components/toastProvider';
import { useAuth } from '../../../../../hooks/useAuth';
import API_ERROR_TRANSLATIONS_DE from '../../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../../global-translations/api-errors.en.json';
import de from './de.json';
import en from './en.json';

/** Metering status is only readable with billing.manage, so nothing is requested or shown otherwise. */
function useMeteringStatus(resourceId: number, enabled: boolean) {
  const { hasPermission } = useAuth();
  return useResourceMeteringServiceGetResourceMeteringStatus({ resourceId }, undefined, {
    enabled: enabled && hasPermission('billing.manage'),
    refetchInterval: 15_000,
  });
}

export function MeterSetupNotice({ resourceId }: { resourceId: number }) {
  const { t } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const { data: status } = useMeteringStatus(resourceId, true);
  const incomplete = status?.meters.filter((meter) => meter.creditsPerUnit > 0 && !meter.configured) ?? [];
  if (!incomplete.length) return null;

  return (
    <Alert status="warning" data-cy="meter-setup-notice">
      <AlertContent>
        <AlertTitle>{t('setup.title')}</AlertTitle>
        <AlertDescription>{t('setup.description')}</AlertDescription>
        <ul className="list-disc pl-4 text-sm">
          {incomplete.flatMap((meter) =>
            meter.problems.map((problem) => (
              <li key={`${meter.meterId}:${problem}`}>
                {meter.name}: {t(`setup.problems.${problem}`)}
              </li>
            )),
          )}
        </ul>
        {hasPermission('resources.update') && <Link href={`/resources/${resourceId}/flows`}>{t('setup.action')}</Link>}
      </AlertContent>
    </Alert>
  );
}

export function EnergySettlementNotices({ resourceId }: { resourceId: number }) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: status } = useMeteringStatus(resourceId, true);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: UseResourceMeteringServiceGetResourceMeteringStatusKeyFn({ resourceId }),
    });
  const onError = (error: Error) => toast.apiError({ error, t, tExists, baseTranslationKey: 'api' });

  const retry = useResourceMeteringServiceRetryResourceMeteringSettlement({
    onSuccess: () => {
      toast.success({ title: t('unsettled.retried.title'), description: t('unsettled.retried.description') });
      refresh();
    },
    onError: (error: Error) => {
      onError(error);
      refresh();
    },
  });
  const waive = useResourceMeteringServiceWaiveResourceMeteringSettlement({
    onSuccess: () => {
      toast.success({ title: t('unsettled.waived.title'), description: t('unsettled.waived.description') });
      refresh();
    },
    onError,
  });

  if (!status?.unsettled.length) return null;

  return (
    <div className="flex flex-col gap-2" data-cy="energy-settlement-notices">
      {status.unsettled.map((session) => {
        const kind = session.status === 'pending' ? 'pending' : 'failed';
        return (
          <Alert key={session.sessionId} status={kind === 'pending' ? 'warning' : 'danger'}>
            <AlertContent>
              <AlertTitle>
                {session.meterName}: {t(`unsettled.${kind}.title`)}
              </AlertTitle>
              <AlertDescription>{t(`unsettled.${kind}.description`, { usageId: session.usageId })}</AlertDescription>
              {session.reason && (
                <AlertDescription>{t('unsettled.reason', { reason: session.reason })}</AlertDescription>
              )}
              {session.latestValue !== null && (
                <AlertDescription>{t('unsettled.lastReading', { value: session.latestValue })}</AlertDescription>
              )}
              {session.retryable && <AlertDescription>{t('unsettled.retryHint')}</AlertDescription>}
              <AlertDescription>{t('unsettled.waiveHint')}</AlertDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                {session.retryable && (
                  <Button
                    size="sm"
                    variant="primary"
                    isPending={retry.isPending}
                    onPress={() => retry.mutate({ resourceId, sessionId: session.sessionId })}
                  >
                    {t('unsettled.retry')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  isPending={waive.isPending}
                  onPress={() => waive.mutate({ resourceId, sessionId: session.sessionId })}
                >
                  {t('unsettled.waive')}
                </Button>
              </div>
            </AlertContent>
          </Alert>
        );
      })}
    </div>
  );
}
