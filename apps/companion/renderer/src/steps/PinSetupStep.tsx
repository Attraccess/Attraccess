import { Button, FieldError, Heading, Input, Label, TextField } from '@heroui/react';

interface Props {
  pinInput: string;
  pinConfirm: string;
  error: string;
  onPinInputChange: (v: string) => void;
  onPinConfirmChange: (v: string) => void;
  onSubmit: () => void;
}

export function PinSetupStep({ pinInput, pinConfirm, error, onPinInputChange, onPinConfirmChange, onSubmit }: Props) {
  return (
    <>
      <div>
        <Heading>Set a PIN</Heading>
        <p className="text-sm leading-5 text-muted">You'll need this PIN to access settings and quit the app.</p>
      </div>
      <TextField value={pinInput} onChange={onPinInputChange} type="password" isInvalid={!!error} fullWidth>
        <Label>PIN</Label>
        <Input placeholder="At least 4 characters" />
      </TextField>
      <TextField value={pinConfirm} onChange={onPinConfirmChange} type="password" isInvalid={!!error} fullWidth>
        <Label>Confirm PIN</Label>
        <Input placeholder="Repeat PIN" />
        <FieldError>{error}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth onPress={onSubmit}>
        Set PIN
      </Button>
    </>
  );
}
