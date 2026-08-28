import { Alert, Button, Form, Input, Label, Spinner, TextField } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useSettingsQuery, useUpdateSettingsMutation } from './queries';

export function MqttSettingsCard() {
  const settingsQuery = useSettingsQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();
  const [defaultServerId, setDefaultServerId] = useState('');

  useEffect(() => {
    setDefaultServerId(settingsQuery.data?.defaultMqttServerId?.toString() ?? '');
  }, [settingsQuery.data]);

  if (settingsQuery.isPending) {
    return <Spinner color="accent" size="sm" />;
  }

  if (settingsQuery.isError) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Could not load MQTT settings</Alert.Title>
          <Alert.Description>{getErrorMessage(settingsQuery.error)}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <section className="wg:max-w-xl">
      <header className="wg:mb-4">
        <h2 className="wg:text-lg wg:font-semibold">MQTT settings</h2>
        <p className="wg:mt-1 wg:text-sm wg:text-muted">Select the MQTT server used when claiming controllers.</p>
      </header>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          updateSettingsMutation.mutate(defaultServerId ? Number(defaultServerId) : null);
        }}
      >
        <TextField name="defaultMqttServerId" type="number">
          <Label>Default MQTT server ID</Label>
          <Input min="1" value={defaultServerId} onChange={(event) => setDefaultServerId(event.target.value)} />
        </TextField>
        {updateSettingsMutation.isError && (
          <Alert className="wg:mt-4" status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{getErrorMessage(updateSettingsMutation.error)}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <Button type="submit" isPending={updateSettingsMutation.isPending}>
          Save
        </Button>
      </Form>
    </section>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
