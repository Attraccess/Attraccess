// Admin password drawer (ATT-498): set or change the admin password of a
// Shelly device via the plugin backend.
import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeading, Form } from '@heroui/react';
import { KeyRoundIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { setAdminPassword, type ShellyDevice } from './api';
import { PasswordFieldRow, StandardDrawer } from './drawer';
import { StatusAlert } from './StatusAlert';
import { useShellyTranslations } from './i18n';
import { TranslationMessage } from '@attraccess/plugins-frontend-ui';

export function AdminPasswordDrawer({
  device,
  onOpenChange,
  onSaved,
}: {
  device: ShellyDevice | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t, tMessage } = useShellyTranslations();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | TranslationMessage | null>(null);

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
      setError({ key: 'password.required' });
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
    [submit],
  );

  return (
    <StandardDrawer isOpen={!!device} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <KeyRoundIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <DrawerHeading className="sh:text-lg sh:font-semibold">{t('password.title')}</DrawerHeading>
            </div>
            {device && (
              <p className="sh:text-sm sh:text-muted">
                {t('password.description', { name: device.name, address: device.ipAddress })}
              </p>
            )}
          </div>
          <Button isIconOnly variant="ghost" aria-label={t('common.close')} onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <Form onSubmit={onSubmit} className="sh:flex sh:flex-col sh:gap-4">
          {device?.authState === 'required' && (
            <PasswordFieldRow
              label={t('password.current')}
              value={currentPassword}
              onChange={setCurrentPassword}
              description={t('password.currentDescription')}
              autoComplete="current-password"
              dataCy="shelly-auth-current-password"
            />
          )}
          <PasswordFieldRow
            label={t('password.new')}
            value={password}
            onChange={setPassword}
            description={t('password.newDescription')}
            required
            autoComplete="new-password"
            dataCy="shelly-auth-password"
          />
          {error && (
            <StatusAlert status="danger" title={t('password.error')} dataCy="shelly-auth-error">
              {tMessage(error)}
            </StatusAlert>
          )}
          <input type="submit" hidden />
        </Form>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" isPending={submitting} onPress={() => void submit()} data-cy="shelly-auth-submit">
          <KeyRoundIcon className="sh:h-4 sh:w-4" /> {t('password.save')}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
