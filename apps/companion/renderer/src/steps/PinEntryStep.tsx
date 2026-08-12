import { Button, FieldError, Heading, Input, Label, TextField } from '@heroui/react';

interface Props {
  title: string;
  description: string;
  submitLabel: string;
  pinEntry: string;
  error: string;
  onPinEntryChange: (v: string) => void;
  onSubmit: () => void;
}

export function PinEntryStep({ title, description, submitLabel, pinEntry, error, onPinEntryChange, onSubmit }: Props) {
  return (
    <>
      <div>
        <Heading>{title}</Heading>
        <p className="text-sm text-default-500">{description}</p>
      </div>
      <TextField value={pinEntry} onChange={onPinEntryChange} type="password" isInvalid={!!error} fullWidth>
        <Label>PIN</Label>
        <Input placeholder="Enter PIN" />
        <FieldError>{error}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth onPress={onSubmit}>
        {submitLabel}
      </Button>
    </>
  );
}
