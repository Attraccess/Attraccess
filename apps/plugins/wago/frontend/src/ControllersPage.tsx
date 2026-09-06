import { Alert, Button, Spinner } from '@heroui/react';
import { PlusIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ClaimControllerModal } from './ClaimControllerModal';
import { ConfigurationEditor } from './ConfigurationEditor';
import { ControllersTable } from './ControllersTable';
import { ControllerDiagnostics } from './ControllerDiagnostics';
import { CommissioningModal } from './CommissioningModal';
import { MqttSettingsModal } from './MqttSettingsModal';
import type { CommissioningSession, WagoController } from './api';
import { RemoveControllerDrawer } from './RemoveControllerDrawer';
import { useCommissioningSessionsQuery, useControllersQuery } from './queries';

export function ControllersPage() {
  const controllersQuery = useControllersQuery();
  const sessionsQuery = useCommissioningSessionsQuery();
  const [claimControllerId, setClaimControllerId] = useState<number | null>(null);
  const [diagnosticsControllerId, setDiagnosticsControllerId] = useState<number | null>(null);
  const [configurationControllerId, setConfigurationControllerId] = useState<number | null>(null);
  const [isCommissioningOpen, setCommissioningOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [commissioningSession, setCommissioningSession] = useState<CommissioningSession | null>(null);
  const [removingController, setRemovingController] = useState<WagoController | null>(null);

  useEffect(() => {
    setCommissioningSession((session) =>
      session ? sessionsQuery.data?.find((candidate) => candidate.id === session.id) ?? session : null,
    );
  }, [sessionsQuery.data]);

  return (
    <main className="wg:mx-auto wg:flex wg:w-full wg:max-w-6xl wg:flex-col wg:gap-6 wg:p-4 wg:md:p-6">
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-4">
        <div>
          <h1 className="wg:text-2xl wg:font-semibold">WAGO controllers</h1>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">
            Commission a controller through a host-key-pinned SSH session; controller credentials are never displayed here.
          </p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button variant="secondary" onPress={() => setSettingsOpen(true)}>
            <SettingsIcon className="wg:h-4 wg:w-4" /> Settings
          </Button>
          <Button onPress={() => setCommissioningOpen(true)}>
            <PlusIcon className="wg:h-4 wg:w-4" /> Commission controller
          </Button>
          <Button
            variant="ghost"
            isPending={controllersQuery.isFetching}
            onPress={() => void controllersQuery.refetch()}
          >
            <RefreshCwIcon className="wg:h-4 wg:w-4" /> Refresh
          </Button>
        </div>
      </header>

      {controllersQuery.isError && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Could not load WAGO controllers</Alert.Title>
            <Alert.Description>{getErrorMessage(controllersQuery.error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {controllersQuery.isPending ? (
        <div className="wg:flex wg:justify-center wg:p-6">
          <Spinner color="accent" />
        </div>
      ) : (
          <ControllersTable
            controllers={controllersQuery.data ?? []}
            sessions={sessionsQuery.data ?? []}
            onClaim={setClaimControllerId}
            onConfigure={setConfigurationControllerId}
            onDiagnostics={setDiagnosticsControllerId}
            onRemove={setRemovingController}
            onResume={(session) => {
              setCommissioningSession(session);
              setCommissioningOpen(true);
            }}
        />
      )}

      {diagnosticsControllerId !== null && <>
        <Button variant="secondary" onPress={() => setDiagnosticsControllerId(null)}>Close diagnostics</Button>
        <ControllerDiagnostics controllerId={diagnosticsControllerId} onConfigure={() => setConfigurationControllerId(diagnosticsControllerId)} />
      </>}
      <ClaimControllerModal
        controllerId={claimControllerId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setClaimControllerId(null);
        }}
      />
      <ConfigurationEditor
        controllerId={configurationControllerId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfigurationControllerId(null);
        }}
      />
      <CommissioningModal
        isOpen={isCommissioningOpen}
        session={commissioningSession}
        onConfigure={(controllerId) => {
          setCommissioningOpen(false);
          setCommissioningSession(null);
          setConfigurationControllerId(controllerId);
        }}
        onOpenChange={(open) => {
          setCommissioningOpen(open);
          if (!open) setCommissioningSession(null);
        }}
      />
      <MqttSettingsModal isOpen={isSettingsOpen} onOpenChange={setSettingsOpen} />
      <RemoveControllerDrawer controller={removingController} onOpenChange={(open) => !open && setRemovingController(null)} />
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
