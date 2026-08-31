import { Alert, Button, Spinner } from '@heroui/react';
import { PlusIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { ClaimControllerModal } from './ClaimControllerModal';
import { ConfigurationEditor } from './ConfigurationEditor';
import { ControllersTable } from './ControllersTable';
import { CreateEnrollmentModal } from './CreateEnrollmentModal';
import { MqttSettingsModal } from './MqttSettingsModal';
import { useControllersQuery } from './queries';

export function ControllersPage() {
  const controllersQuery = useControllersQuery();
  const [claimControllerId, setClaimControllerId] = useState<number | null>(null);
  const [configurationControllerId, setConfigurationControllerId] = useState<number | null>(null);
  const [isEnrollmentOpen, setEnrollmentOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);

  return (
    <main className="wg:mx-auto wg:flex wg:w-full wg:max-w-6xl wg:flex-col wg:gap-6 wg:p-4 wg:md:p-6">
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-4">
        <div>
          <h1 className="wg:text-2xl wg:font-semibold">WAGO controllers</h1>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">
            Enroll a controller to connect it, then verify physical access before it can receive commands.
          </p>
        </div>
        <div className="wg:flex wg:flex-wrap wg:gap-2">
          <Button variant="secondary" onPress={() => setSettingsOpen(true)}>
            <SettingsIcon className="wg:h-4 wg:w-4" /> Settings
          </Button>
          <Button onPress={() => setEnrollmentOpen(true)}>
            <PlusIcon className="wg:h-4 wg:w-4" /> Enroll device
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
          onClaim={setClaimControllerId}
          onConfigure={setConfigurationControllerId}
        />
      )}

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
      <CreateEnrollmentModal
        isOpen={isEnrollmentOpen}
        onOpenChange={setEnrollmentOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <MqttSettingsModal isOpen={isSettingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
