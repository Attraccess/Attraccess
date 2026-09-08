import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Input, Label, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
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
  const form = useRef<HTMLFormElement>(null);
  const status = query.data;
  async function recover() {
    if (!form.current?.reportValidity() || busy || !confirmed || status?.state !== 'stale') return;
    const fields = new FormData(form.current);
    const temporarySsh = {
      username: String(fields.get('leaseUsername') ?? ''),
      password: String(fields.get('leasePassword') ?? ''),
    };
    form.current.reset();
    setConfirmed(false);
    setBusy(true);
    setError(false);
    try {
      await api.request(`/${sessionId}/operation/recover`, {
        method: 'POST',
        body: { temporarySsh, owner: status.owner, previousWorkerStopped: true },
      });
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      temporarySsh.password = '';
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
          <form
            ref={form}
            onSubmit={(event) => {
              event.preventDefault();
              void recover();
            }}
          >
            <p>
              Recovery is available after {new Date(status.recoveryAfter).toLocaleString()}. Stop the previous
              Attraccess commissioning instance first. The server then checks that both controller locks are idle.
              Runtime and management snapshots are not removed.
            </p>
            <TextField name="leaseUsername" isRequired isDisabled={busy}>
              <Label>Coordinator recovery SSH username</Label>
              <Input autoComplete="off" />
            </TextField>
            <TextField name="leasePassword" isRequired isDisabled={busy}>
              <Label>Coordinator recovery SSH password</Label>
              <Input type="password" autoComplete="off" />
            </TextField>
            <Checkbox isSelected={confirmed} onChange={setConfirmed} isDisabled={busy}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                The previous commissioning instance has stopped, not merely paused. I approve checking and releasing its
                expired operation.
              </Checkbox.Content>
            </Checkbox>
            <Button type="submit" isDisabled={busy || !confirmed}>
              Recover interrupted coordinator
            </Button>
          </form>
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
