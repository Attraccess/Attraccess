import { Alert, Button, Form, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { useCreateEnrollmentMutation } from './queries';

export function CreateEnrollmentCard() {
  const createEnrollmentMutation = useCreateEnrollmentMutation();
  const [hardwareId, setHardwareId] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');

  return (
    <section className="wg:max-w-xl">
      <header className="wg:mb-4">
        <h2 className="wg:text-lg wg:font-semibold">Enrollment package</h2>
        <p className="wg:mt-1 wg:text-sm wg:text-muted">
          Manual credentials must be restricted to this controller&apos;s discovery and claim topics.
        </p>
      </header>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          createEnrollmentMutation.mutate({
            hardwareId,
            manualUsername: manualUsername || undefined,
            manualPassword: manualPassword || undefined,
          });
        }}
      >
        <TextField name="hardwareId" isRequired>
          <Label>Controller hardware ID</Label>
          <Input value={hardwareId} onChange={(event) => setHardwareId(event.target.value)} />
        </TextField>
        <TextField name="manualUsername">
          <Label>Manual discovery username (fallback)</Label>
          <Input value={manualUsername} onChange={(event) => setManualUsername(event.target.value)} />
        </TextField>
        <TextField name="manualPassword" type="password">
          <Label>Manual discovery password (fallback)</Label>
          <Input value={manualPassword} onChange={(event) => setManualPassword(event.target.value)} />
        </TextField>
        <Button type="submit" isPending={createEnrollmentMutation.isPending}>
          Create package
        </Button>
      </Form>
      {createEnrollmentMutation.isError && (
        <Alert className="wg:mt-4" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{getErrorMessage(createEnrollmentMutation.error)}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {createEnrollmentMutation.data && (
        <pre className="wg:mt-4 wg:overflow-x-auto wg:rounded-medium wg:bg-default-100 wg:p-4 wg:text-xs">
          {JSON.stringify(createEnrollmentMutation.data, null, 2)}
        </pre>
      )}
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
