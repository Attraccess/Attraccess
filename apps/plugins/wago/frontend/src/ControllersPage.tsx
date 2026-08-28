import { Alert, Button, Spinner } from '@heroui/react';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { ClaimControllerModal } from './ClaimControllerModal';
import { CreateEnrollmentCard } from './CreateEnrollmentCard';
import { ControllersTable } from './ControllersTable';
import { MqttSettingsCard } from './MqttSettingsCard';
import { useControllersQuery } from './queries';

export function ControllersPage() {
  const controllersQuery = useControllersQuery();
  const [claimControllerId, setClaimControllerId] = useState<number | null>(null);

  return (
    <main className="wg:mx-auto wg:flex wg:w-full wg:max-w-6xl wg:flex-col wg:gap-6 wg:p-4 wg:md:p-6">
      <header className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-4">
        <div>
          <h1 className="wg:text-2xl wg:font-semibold">WAGO controllers</h1>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">
            Discovery candidates cannot receive commands until physically claimed.
          </p>
        </div>
        <Button
          variant="secondary"
          isPending={controllersQuery.isFetching}
          onPress={() => void controllersQuery.refetch()}
        >
          <RefreshCwIcon className="wg:h-4 wg:w-4" /> Refresh
        </Button>
      </header>

      <MqttSettingsCard />
      <CreateEnrollmentCard />

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
        <ControllersTable controllers={controllersQuery.data ?? []} onClaim={setClaimControllerId} />
      )}

      <ClaimControllerModal
        controllerId={claimControllerId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setClaimControllerId(null);
        }}
      />
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
