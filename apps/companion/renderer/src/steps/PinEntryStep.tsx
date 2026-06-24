import { Button, FieldError, Input, Label, TextField } from '@heroui/react';

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
        <h1 className="text-xl font-bold">{isQuit ? 'Confirm quit' : 'Access settings'}</h1>
        <p className="text-fg-muted text-sm mt-1">
          {isQuit
            ? 'Enter your PIN to quit Attraccess Companion.'
            : 'Enter your PIN to access settings.'}
        </p>
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
