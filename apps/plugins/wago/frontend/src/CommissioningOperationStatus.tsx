import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox } from '@heroui/react';
import { useState } from 'react';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { CommissioningLeaseStatus } from '../../shared/commissioning';

const api = createPluginApiClient('/api/wago/commissioning/sessions');
export function CommissioningOperationStatus({ sessionId }: { sessionId: number }) {
  const query = useQuery({
    queryKey: ['wago', 'commissioning-operation', sessionId],
    queryFn: () => api.request<CommissioningLeaseStatus>(`/${sessionId}/operation`),
    refetchInterval: 5000,
  });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const status = query.data;
  async function recover() {
    if (busy || !confirmed || status?.state !== 'stale') return;
    setConfirmed(false);
    setBusy(true);
    setError(false);
    try {
      await api.request(`/${sessionId}/operation/recover`, {
        method: 'POST',
        body: { owner: status.owner, previousWorkerStopped: true },
      });
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  if (!status || status.state === 'available') return null;
  if (status.state !== 'active' && status.state !== 'stale') return null;
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {status.state === 'active'
            ? 'A commissioning operation owns this controller'
            : 'Interrupted coordinator recovery required'}
        </Alert.Title>
        <Alert.Description>
          Another operation cannot change this controller until ownership is released. An application restart never
          silently takes over an interrupted operation.
        </Alert.Description>
        {status.state === 'stale' && (
          <div>
            <p>
              Recovery is available after {new Date(status.recoveryAfter).toLocaleString()}. Stop the previous
              Attraccess commissioning instance first. The server then checks that both controller locks are idle.
              Runtime and management snapshots are not removed.
            </p>
            <Checkbox isSelected={confirmed} onChange={setConfirmed} isDisabled={busy}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                The previous commissioning instance has stopped, not merely paused. I approve checking and releasing its
                expired operation.
              </Checkbox.Content>
            </Checkbox>
            <Button onPress={recover} isDisabled={busy || !confirmed}>
              Recover interrupted coordinator
            </Button>
          </div>
        )}
        {error && (
          <p role="alert">
            Recovery remains blocked. Check the safe timeout, previous instance and controller access, then retry.
          </p>
        )}
      </Alert.Content>
    </Alert>
  );
}
