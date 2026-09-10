import { Alert, Button, Checkbox, Input, Label, TextField } from '@heroui/react';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';
import type { CommissioningSession } from './api';

const api = createPluginApiClient('/api/wago/commissioning/sessions');

/** Cleanup remains explicit because it changes the controller; readiness checks run during installation. */
export function CommissioningPlatformPreflight({ session }: { session: CommissioningSession }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [useCustomSshCredentials, setUseCustomSshCredentials] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const needsCleanup = !!session.dockerProvisionState && session.runtimeRecoveryAvailable !== true;

  if (!needsCleanup) return null;

  async function recover() {
    if (busy || !approved || !form.current?.reportValidity()) return;
    const values = new FormData(form.current);
    const temporarySsh = useCustomSshCredentials
      ? {
          username: String(values.get('recoveryUsername') ?? ''),
          password: String(values.get('recoveryPassword') ?? ''),
        }
      : undefined;
    setBusy(true);
    setError('');
    try {
      const value = await api.request<CommissioningSession>(`/${session.id}/platform/recover`, {
        method: 'POST',
        body: { ...(temporarySsh ? { temporarySsh } : {}), reviewedDockerActivation: true },
      });
      client.setQueryData<CommissioningSession[]>(['wago', 'commissioning-sessions'], (entries) =>
        entries?.map((entry) => (entry.id === value.id ? value : entry)),
      );
      form.current?.reset();
      setApproved(false);
      setUseCustomSshCredentials(false);
    } catch {
      setError('Controller preparation could not be cleaned up. Try again with valid SSH credentials.');
    } finally {
      if (temporarySsh) temporarySsh.password = '';
      setBusy(false);
    }
  }

  return (
    <section className="wg:space-y-3" aria-label="Controller preparation cleanup">
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Controller preparation needs cleanup</Alert.Title>
          <Alert.Description>
            Remove the incomplete preparation before retrying installation. Existing workloads are not restored.
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <form ref={form} onSubmit={(event) => event.preventDefault()} className="wg:space-y-3">
        <Checkbox isSelected={useCustomSshCredentials} isDisabled={busy} onChange={setUseCustomSshCredentials}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>Use different SSH credentials</Checkbox.Content>
        </Checkbox>
        {useCustomSshCredentials && (
          <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
            <TextField name="recoveryUsername" isRequired isDisabled={busy}>
              <Label>SSH username</Label>
              <Input autoComplete="off" />
            </TextField>
            <TextField name="recoveryPassword" isRequired isDisabled={busy}>
              <Label>SSH password</Label>
              <Input type="password" autoComplete="off" />
            </TextField>
          </div>
        )}
        <Checkbox isSelected={approved} onChange={setApproved} isDisabled={busy}>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>I approve cleaning up this controller preparation.</Checkbox.Content>
        </Checkbox>
        <Button type="button" isDisabled={busy || !approved} onPress={() => void recover()}>
          Clean up controller preparation
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
