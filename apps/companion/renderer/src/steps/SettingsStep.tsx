import { useState } from 'react';
import { Button, CardDescription, FieldError, Heading, Input, Label, TextField } from '@heroui/react';
import type { CompanionSettings } from '../types';

interface Props {
  settings: CompanionSettings;
  onSave: (s: CompanionSettings) => void;
  onBack: () => void;
}

export function SettingsStep({ settings, onSave, onBack }: Props) {
  const [idleTimeout, setIdleTimeout] = useState(String(settings.idleTimeoutMinutes));
  const [error, setError] = useState('');

  function handleSave() {
    const val = parseInt(idleTimeout, 10);
    if (isNaN(val) || val < 0) {
      setError('Enter a number ≥ 0 (0 = disabled).');
      return;
    }
    setError('');
    onSave({ ...settings, idleTimeoutMinutes: val });
  }

  return (
    <>
      <div>
        <Heading>Settings</Heading>
        <CardDescription>Configure companion app behaviour.</CardDescription>
      </div>
      <TextField
        value={idleTimeout}
        onChange={setIdleTimeout}
        type="number"
        isInvalid={!!error}
        fullWidth
      >
        <Label>Idle timeout (minutes, 0 = disabled)</Label>
        <Input placeholder="15" />
        <FieldError>{error}</FieldError>
      </TextField>
      <Button variant="primary" fullWidth onPress={handleSave}>
        Save
      </Button>
      <Button variant="secondary" fullWidth onPress={onBack}>
        Back
      </Button>
    </>
  );
}
