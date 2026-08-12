import { useState } from 'react';
import { Button, FieldError, Heading, Input, Label, Switch, TextField } from '@heroui/react';
import type { CompanionSettings } from '../types';

interface Props {
  settings: CompanionSettings;
  onSave: (s: CompanionSettings) => void;
  onBack: () => void;
}

export function SettingsStep({ settings, onSave, onBack }: Props) {
  const [idleTimeout, setIdleTimeout] = useState(String(settings.idleTimeoutMinutes));
  const [foregroundApp, setForegroundApp] = useState(settings.foregroundApp ?? true);
  const [usbDevices, setUsbDevices] = useState(settings.usbDevices ?? true);
  const [error, setError] = useState('');

  function handleSave() {
    const val = parseInt(idleTimeout, 10);
    if (isNaN(val) || val < 0) {
      setError('Enter a number ≥ 0 (0 = disabled).');
      return;
    }
    setError('');
    onSave({ ...settings, idleTimeoutMinutes: val, foregroundApp, usbDevices });
  }

  return (
    <>
      <div>
        <Heading>Settings</Heading>
        <p className="text-sm text-default-500">Configure companion app behaviour.</p>
      </div>
      <TextField value={idleTimeout} onChange={setIdleTimeout} type="number" isInvalid={!!error} fullWidth>
        <Label>Idle timeout (minutes, 0 = disabled)</Label>
        <Input placeholder="15" />
        <FieldError>{error}</FieldError>
      </TextField>
      <Switch isSelected={foregroundApp} onChange={setForegroundApp}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Report foreground app to flow triggers
        </Switch.Content>
      </Switch>
      <Switch isSelected={usbDevices} onChange={setUsbDevices}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Report USB device connect/disconnect to flow triggers
        </Switch.Content>
      </Switch>
      <Button variant="primary" fullWidth onPress={handleSave}>
        Save
      </Button>
      <Button variant="secondary" fullWidth onPress={onBack}>
        Back
      </Button>
    </>
  );
}
