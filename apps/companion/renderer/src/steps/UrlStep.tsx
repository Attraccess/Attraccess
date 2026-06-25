import { Button, CardDescription, FieldError, Heading, Input, Label, Spinner, TextField } from '@heroui/react';

interface Props {
  serverUrl: string;
  connectError: string;
  connecting: boolean;
  registered: boolean;
  connected: boolean;
  onServerUrlChange: (v: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onChangePin?: () => void;
  onOpenSettings?: () => void;
}

export function UrlStep({
  serverUrl,
  connectError,
  connecting,
  registered,
  connected,
  onServerUrlChange,
  onConnect,
  onDisconnect,
  onChangePin,
  onOpenSettings,
}: Props) {
  // Already registered: show status, never a Connect button — re-connecting an
  // existing device would re-register it. To switch servers, Disconnect first.
  if (registered) {
    return (
      <>
        <div>
          <Heading>Attraccess Companion</Heading>
          <CardDescription>{serverUrl}</CardDescription>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: connected ? '#22c55e' : '#f59e0b' }}
          />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {onOpenSettings && (
          <Button variant="secondary" fullWidth onPress={onOpenSettings}>
            Settings
          </Button>
        )}
        {onChangePin && (
          <Button variant="secondary" fullWidth onPress={onChangePin}>
            Change PIN
          </Button>
        )}
        <Button variant="danger" fullWidth onPress={onDisconnect}>
          Disconnect
        </Button>
      </>
    );
  }

  return (
    <>
      <div>
        <Heading>Attraccess Companion</Heading>
        <CardDescription>
          Enter the URL of your Attraccess server to get started.
        </CardDescription>
      </div>
      <TextField value={serverUrl} onChange={onServerUrlChange} type="url" isInvalid={!!connectError} fullWidth>
        <Label>Server URL</Label>
        <Input placeholder="https://attraccess.example.com" />
        <FieldError>{connectError}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth isDisabled={connecting} onPress={onConnect}>
        {connecting ? <Spinner /> : 'Connect'}
      </Button>
      {onChangePin && (
        <Button variant="secondary" fullWidth onPress={onChangePin}>
          Change PIN
        </Button>
      )}
    </>
  );
}
