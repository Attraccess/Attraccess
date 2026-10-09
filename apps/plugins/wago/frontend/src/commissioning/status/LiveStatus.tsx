import { Alert, Button } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useWagoTranslations } from '../../i18n';
import { CommissioningModel } from '../CommissioningModal';

export function CommissioningLiveStatus({ model }: { model: CommissioningModel }) {
  const { t } = useWagoTranslations();
  const { session, commissioningSessionsQuery: query } = model;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!session) return null;
  const checkedAt = query.dataUpdatedAt || Date.parse(session.updatedAt);
  const checkedSeconds = Math.max(0, Math.floor((now - checkedAt) / 1000));
  const stale = !Number.isFinite(checkedAt) || checkedSeconds > 15;
  const phaseSeconds = Math.max(0, Math.floor((now - Date.parse(session.updatedAt)) / 1000));
  const active =
    session.state === 'delivering' || model.deliverSessionMutation.isPending || model.recoverSessionMutation.isPending;
  const remaining = session.operationDeadlineAt
    ? Math.ceil((Date.parse(session.operationDeadlineAt) - now) / 1000)
    : null;
  const expiredLogin = query.error && 'status' in query.error && query.error.status === 401;
  return (
    <div className="wg:space-y-2">
      {query.isError || stale ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('commissioningUI.statusUnavailable')}</Alert.Title>
            <Alert.Description>
              {t(expiredLogin ? 'commissioningUI.statusLoginExpired' : 'commissioningUI.statusStale')}
            </Alert.Description>
            <Button variant="secondary" size="sm" onPress={() => void query.refetch()}>
              {t('commissioningUI.refreshStatus')}
            </Button>
          </Alert.Content>
        </Alert>
      ) : (
        <p className="wg:text-sm wg:text-muted">{t('commissioningUI.statusChecked', { seconds: checkedSeconds })}</p>
      )}
      {active && remaining !== null && Number.isFinite(remaining) && (
        <p className="wg:text-sm wg:text-muted">
          {t(remaining > 0 ? 'commissioningUI.operationRemaining' : 'commissioningUI.operationOverdue', {
            minutes: Math.floor(Math.max(0, remaining) / 60),
            seconds: Math.max(0, remaining) % 60,
          })}
        </p>
      )}
      {active && Number.isFinite(phaseSeconds) && (
        <p className="wg:text-sm wg:text-muted">
          {t('commissioningUI.phaseElapsed', { minutes: Math.floor(phaseSeconds / 60), seconds: phaseSeconds % 60 })}{' '}
          {t('commissioningUI.phaseWaitHint')}
        </p>
      )}
    </div>
  );
}
