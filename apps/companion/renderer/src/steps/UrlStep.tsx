import { Button, FieldError, Input, Label, Spinner, TextField } from '@heroui/react';

interface Props {
  serverUrl: string;
  connectError: string;
  connecting: boolean;
  onServerUrlChange: (v: string) => void;
  onConnect: () => void;
}

export function UrlStep({ serverUrl, connectError, connecting, onServerUrlChange, onConnect }: Props) {
  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Attraccess Companion</h1>
        <p className="text-fg-muted text-sm mt-1">
          Enter the URL of your Attraccess server to get started.
        </p>
      </div>
      <TextField value={serverUrl} onChange={onServerUrlChange} type="url" isInvalid={!!connectError} fullWidth>
        <Label>Server URL</Label>
        <Input placeholder="https://attraccess.example.com" />
        <FieldError>{connectError}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth isDisabled={connecting} onPress={onConnect}>
        {connecting ? <Spinner /> : 'Connect'}
      </Button>
    </>
  );
}
