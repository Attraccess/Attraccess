import { PageHeader, StatusAlert, TableDataLoadingIndicator } from '@attraccess/plugins-frontend-ui';

import { PlusIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClaimControllerModal } from './ClaimControllerModal';
import { useNavigate } from 'react-router-dom';
import { ControllersTable } from './Table';
import { CommissioningModal } from '../commissioning/CommissioningModal';
import { MqttSettingsModal } from './MqttSettingsModal';
import type { CommissioningSession, WagoController } from '../api/client';
import { RemoveControllerDrawer } from './RemoveControllerDrawer';
import { useCommissioningSessionsQuery, useControllersQuery } from '../api/queries';
import { useWagoTranslations } from '../i18n';

export function ControllersPage() {
  const { t } = useWagoTranslations();
  const controllersQuery = useControllersQuery();
  const sessionsQuery = useCommissioningSessionsQuery();
  const [claimControllerId, setClaimControllerId] = useState<number | null>(null);
  const navigate = useNavigate();
  const configure = (id: number) => navigate(`/wago/controllers/${id}/configuration`);
  const [isCommissioningOpen, setCommissioningOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [commissioningSession, setCommissioningSession] = useState<CommissioningSession | null>(null);
  const [removingController, setRemovingController] = useState<WagoController | null>(null);

  useEffect(() => {
    setCommissioningSession((session) =>
      session ? (sessionsQuery.data?.find((candidate) => candidate.id === session.id) ?? session) : null,
    );
  }, [sessionsQuery.data]);

  return (
    <main className="wg:mx-auto wg:flex wg:w-full wg:max-w-6xl wg:flex-col wg:gap-6 wg:p-4 wg:md:p-6">
      <PageHeader
        title={t('controllers.title')}
        subtitle={t('controllers.description')}
        noMargin
        actions={[
          {
            key: 'settings',
            label: t('common.settings'),
            icon: <SettingsIcon className="wg:h-4 wg:w-4" />,
            variant: 'secondary',
            onPress: () => setSettingsOpen(true),
          },
          {
            key: 'commission',
            label: t('controllers.commission'),
            icon: <PlusIcon className="wg:h-4 wg:w-4" />,
            variant: 'primary',
            onPress: () => setCommissioningOpen(true),
          },
          {
            key: 'refresh',
            label: t('common.refresh'),
            icon: <RefreshCwIcon className="wg:h-4 wg:w-4" />,
            variant: 'secondary',
            isPending: controllersQuery.isFetching,
            onPress: () => void controllersQuery.refetch(),
          },
        ]}
      />

      {controllersQuery.isError && (
        <StatusAlert status="danger" title={t('controllers.loadError')}>
          {controllersQuery.error instanceof Error ? controllersQuery.error.message : t('common.retry')}
        </StatusAlert>
      )}

      {controllersQuery.isPending ? (
        <TableDataLoadingIndicator />
      ) : (
        <ControllersTable
          controllers={controllersQuery.data ?? []}
          sessions={sessionsQuery.data ?? []}
          onClaim={setClaimControllerId}
          onConfigure={configure}
          onRemove={setRemovingController}
          onResume={(session) => {
            setCommissioningSession(session);
            setCommissioningOpen(true);
          }}
        />
      )}

      <ClaimControllerModal
        controllerId={claimControllerId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setClaimControllerId(null);
        }}
      />
      <CommissioningModal
        isOpen={isCommissioningOpen}
        session={commissioningSession}
        onConfigure={(controllerId) => {
          setCommissioningOpen(false);
          setCommissioningSession(null);
          configure(controllerId);
        }}
        onOpenChange={(open) => {
          setCommissioningOpen(open);
          if (!open) setCommissioningSession(null);
        }}
      />
      <MqttSettingsModal isOpen={isSettingsOpen} onOpenChange={setSettingsOpen} />
      <RemoveControllerDrawer
        controller={removingController}
        onOpenChange={(open) => !open && setRemovingController(null)}
      />
    </main>
  );
}
