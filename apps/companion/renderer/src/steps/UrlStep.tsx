import { Button, CardDescription, FieldError, Heading, Input, Label, Spinner, TextField } from '@heroui/react';

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
    </>
  );
}
