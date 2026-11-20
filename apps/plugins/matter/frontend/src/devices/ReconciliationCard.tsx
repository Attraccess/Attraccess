import { Button, DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Card, Chip, Spinner } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { runReconciliation, type ReconciliationStatus } from './api';
import type { MatterResource } from '../useMatterResource';

const RESULT_COLOR = {
  applied: 'success',
  skipped_unavailable: 'warning',
  skipped_non_authoritative: 'warning',
  failed: 'danger',
} as const;

/** The outcome of the last reconciliation with the sidecar's inventory, and "Run reconciliation now" (manage). */
export function ReconciliationCard({
  resource,
  canManage,
}: Readonly<{ resource: MatterResource<ReconciliationStatus>; canManage: boolean }>) {
  const { t } = useMatterTranslations();
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { data, error, loading, refetch } = resource;

  const run = async () => {
    setRunning(true);
    setFailure(null);
    try {
      await runReconciliation();
      await refetch();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
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
            {error}
          </StatusAlert>
        )}
        {data && (
          <div
            className="mt:flex mt:flex-wrap mt:items-center mt:gap-2 mt:text-sm"
            data-cy="matter-reconciliation-status"
          >
            {data.lastResult ? (
              <>
                <Chip color={RESULT_COLOR[data.lastResult]} variant="soft">
                  {t(`devices.reconciliation.result.${data.lastResult}`)}
                </Chip>
                <span>
                  {t('devices.reconciliation.lastRun')}: <DateTimeDisplay date={data.lastFinishedAt} />
                </span>
                {data.lastSummary && (
                  <span className="mt:text-muted">
                    {t('devices.reconciliation.summary', {
                      nodes: data.lastSummary.nodesListed,
                      changes: data.lastSummary.changeCount,
                    })}
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
