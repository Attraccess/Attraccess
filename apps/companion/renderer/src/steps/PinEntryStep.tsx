import { Button, CardDescription, FieldError, Heading, Input, Label, TextField } from '@heroui/react';

interface Props {
  pendingAction: 'settings' | 'quit' | null;
  pinEntry: string;
  error: string;
  onPinEntryChange: (v: string) => void;
  onSubmit: () => void;
}

export function PinEntryStep({ pendingAction, pinEntry, error, onPinEntryChange, onSubmit }: Props) {
  const isQuit = pendingAction === 'quit';
  return (
    <>
      <div>
        <Heading>{isQuit ? 'Confirm quit' : 'Access settings'}</Heading>
        <CardDescription>
          {isQuit
            ? 'Enter your PIN to quit Attraccess Companion.'
            : 'Enter your PIN to access settings.'}
        </CardDescription>
      </div>
      <TextField value={pinEntry} onChange={onPinEntryChange} type="password" isInvalid={!!error} fullWidth>
        <Label>PIN</Label>
        <Input placeholder="Enter PIN" />
        <FieldError>{error}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth onPress={onSubmit}>
        {isQuit ? 'Quit' : 'Confirm'}
      </Button>
    </>
  );
}
