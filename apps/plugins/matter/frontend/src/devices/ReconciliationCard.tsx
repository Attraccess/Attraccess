import { Button, DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Chip, Spinner } from '@heroui/react';
import { useState } from 'react';
import { errorMessage } from '../errorMessage';
import { HEALTH_LEVEL_COLOR, reconciliationLevel } from '../healthLevel';
import { useMatterTranslations } from '../i18n';
import { runReconciliation, type ReconciliationStatus } from './api';
import { RetryButton } from './RetryButton';

/** The outcome of the last reconciliation with the sidecar's inventory, and "Run reconciliation now" (manage). */
export function ReconciliationCard({
  data,
  error,
  loading,
  onRefresh,
  canManage,
}: Readonly<{
  data: ReconciliationStatus | null;
  error: string | null;
  loading: boolean;
  /** Reads the status again: after a run, and from "Try again" under a load error. */
  onRefresh: () => Promise<unknown>;
  canManage: boolean;
}>) {
  const { t } = useMatterTranslations();
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setFailure(null);
    try {
      await runReconciliation();
      await onRefresh();
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card data-cy="matter-reconciliation">
      <Card.Header>
        <Card.Title>{t('devices.reconciliation.title')}</Card.Title>
      </Card.Header>
      <Card.Content className="mt:flex mt:flex-col mt:gap-3">
        {loading && <Spinner size="sm" />}
        {error && !data && (
          <StatusAlert
            status="danger"
            title={t('devices.reconciliation.loadError')}
            data-cy="matter-reconciliation-error"
          >
            <span className="mt:block">{error}</span>
            <RetryButton onRetry={onRefresh} data-cy="matter-reconciliation-retry" />
          </StatusAlert>
        )}
        {data && (
          <div
            className="mt:flex mt:flex-wrap mt:items-center mt:gap-2 mt:text-sm"
            data-cy="matter-reconciliation-status"
          >
            {data.lastResult ? (
              <>
                <Chip color={HEALTH_LEVEL_COLOR[reconciliationLevel(data.lastResult)]} variant="soft">
                  {t(`devices.reconciliation.result.${data.lastResult}`)}
                </Chip>
                <span>
                  {t('devices.reconciliation.lastRun')}: <DateTimeDisplay date={data.lastFinishedAt} />
                </span>
                {data.lastSummary && (
                  <span className="mt:text-muted">
                    {t('devices.reconciliation.nodesListed', { count: data.lastSummary.nodesListed })},{' '}
                    {t('devices.reconciliation.changes', { count: data.lastSummary.changeCount })}
                  </span>
                )}
              </>
            ) : (
              <span className="mt:text-muted" data-cy="matter-reconciliation-never">
                {t('devices.reconciliation.never')}
              </span>
            )}
          </div>
        )}
        {failure && (
          <StatusAlert
            status="danger"
            title={t('devices.reconciliation.runError')}
            data-cy="matter-reconciliation-run-error"
          >
            {failure}
          </StatusAlert>
        )}
        {canManage && (
          <div>
            <Button size="sm" variant="secondary" isPending={running} onPress={run} data-cy="matter-reconciliation-run">
              {t('devices.reconciliation.run')}
            </Button>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
