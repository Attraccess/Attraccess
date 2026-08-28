import { Alert, Button, Card, Form, Input, Label, Spinner, TextField } from '@heroui/react';
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
    <Card className="wg:max-w-xl">
      <Card.Header>
        <Card.Title>MQTT settings</Card.Title>
        <Card.Description>Select the MQTT server used when claiming controllers.</Card.Description>
      </Card.Header>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          updateSettingsMutation.mutate(defaultServerId ? Number(defaultServerId) : null);
        }}
      >
        <Card.Content>
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
        </Card.Content>
        <Card.Footer>
          <Button type="submit" isPending={updateSettingsMutation.isPending}>
            Save
          </Button>
        </Card.Footer>
      </Form>
    </Card>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
