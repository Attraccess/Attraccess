// Admin password drawer (ATT-498): set or change the admin password of a
// Shelly device via the plugin backend.
import { Button, DrawerBody, DrawerFooter, DrawerHeader, Form } from '@heroui/react';
import { EyeIcon, EyeOffIcon, KeyRoundIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { setAdminPassword, type ShellyDevice } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

function PasswordFieldRow({
  label,
  value,
  onChange,
  description,
  required,
  dataCy,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
  required?: boolean;
  dataCy?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextFieldRow
        label={label}
        value={visible ? value : value.replace(/./g, '•')}
        onChange={onChange}
        placeholder={visible ? 'enter password' : '••••••••'}
        required={required}
        description={description}
        dataCy={dataCy}
      />
      {/* ponytail: native input[type=password] not used — TextFieldRow wraps
          a plain Input; toggle visibility via state instead */}
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-6"
        onPress={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </Button>
      {/* Feed the actual (unmasked) value into the form for submission. */}
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

export function AdminPasswordDrawer({
  device,
  onOpenChange,
  onSaved,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setCurrentPassword('');
      setPassword('');
      setError(null);
    }
  }, [device]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const submit = useCallback(async () => {
    if (!device) return;
    const nextPassword = password.trim();
    if (!nextPassword) {
      setError('New password is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setAdminPassword(device.id, { currentPassword: currentPassword || undefined, password: nextPassword });
      onSaved();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [close, currentPassword, device, onSaved, password]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submit();
    },
    [submit]
  );

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="flex w-full items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <KeyRoundIcon className="h-5 w-5 shrink-0 text-accent-soft-foreground" />
              <h2 className="text-lg font-semibold">Admin password</h2>
            </div>
            {device && (
              <p className="text-sm text-muted">
                Set or change the admin password of {device.name} ({device.ipAddress}).
              </p>
            )}
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={onSubmit} className="flex flex-col gap-4">
          {device?.authState === 'required' && (
            <PasswordFieldRow
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              description="Required because this device already has authentication enabled."
              autoComplete="current-password"
              dataCy="shelly-auth-current-password"
            />
          )}
          <PasswordFieldRow
            label="New admin password"
            value={password}
            onChange={setPassword}
            description="Protects the device's local web interface and API."
            required
            autoComplete="new-password"
            dataCy="shelly-auth-password"
          />
          {error && (
            <StatusAlert status="danger" title="Could not set password" dataCy="shelly-auth-error">
              {error}
            </StatusAlert>
          )}
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          Cancel
        </Button>
        <Button variant="primary" isPending={submitting} onPress={() => void submit()} data-cy="shelly-auth-submit">
          <KeyRoundIcon className="h-4 w-4" /> Save password
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
