import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Alert, AlertContent, AlertDescription, AlertIndicator, Button, Input, Label, TextField, cn } from '@heroui/react';
import { AlertCircleIcon } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { PageHeader } from '../../../../../components/pageHeader';
import { useAttractapSerialComm } from '../Auth';

import de from './de.json';
import en from './en.json';

interface AttractapSerialConfiguratorPinProps {
  className?: string;
  mode?: 'change' | 'set';
}

export function AttractapSerialConfiguratorPin({ className, mode = 'change' }: AttractapSerialConfiguratorPinProps) {
  const { t } = useTranslations({ de, en });
  const { setAuthCode, sendAuthedCommand, refreshPinStatus } = useAttractapSerialComm();

  const handleForgetPin = useCallback(() => {
    setAuthCode(null);
  }, [setAuthCode]);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePin = useCallback((pin: string) => /^\d{4}$/.test(pin), []);

  const handleChangePin = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      setError(null);

      if (mode === 'change' && !validatePin(currentPin)) {
        setError(t('errors.invalid'));
        return;
      }

      if (!validatePin(newPin)) {
        setError(t('errors.invalid'));
        return;
      }

      if (newPin !== confirmPin) {
        setError(t('errors.mismatch'));
        return;
      }

      setIsSubmitting(true);
      try {
        if (mode === 'set') {
          const payload = JSON.stringify({ newCode: newPin });
          const espTools = (await import('../../../../../utils/esp-tools')).ESPTools.getInstance();
          const response = await espTools.sendCommand({ topic: 'auth.code.set', payload }, true, 5000);

          if (!response) {
            throw new Error('NO_RESPONSE');
          }
          const parsed = JSON.parse(response) as { error?: string };
          if (parsed?.error) {
            setError(parsed.error);
            return;
          }

          setAuthCode(newPin);
          await refreshPinStatus();
        } else {
          await sendAuthedCommand('auth.code.set', {
            currentCode: currentPin,
            newCode: newPin,
          });
          setAuthCode(newPin);
        }
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
      } catch (err) {
        console.error(err);
        setError(t('errors.auth'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [currentPin, newPin, confirmPin, mode, sendAuthedCommand, setAuthCode, refreshPinStatus, t, validatePin],
  );

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <PageHeader noMargin title={t('title')} />
      <form className="flex flex-col gap-3" onSubmit={handleChangePin}>
        {mode === 'change' && (
          <TextField value={currentPin} onChange={setCurrentPin}>
            <Label>{t('fields.currentPin')}</Label>
            <Input maxLength={4} inputMode="numeric" required />
          </TextField>
        )}
        <TextField value={newPin} onChange={setNewPin}>
          <Label>{t('fields.newPin')}</Label>
          <Input maxLength={4} inputMode="numeric" required />
        </TextField>
        <TextField value={confirmPin} onChange={setConfirmPin}>
          <Label>{t('fields.confirmPin')}</Label>
          <Input maxLength={4} inputMode="numeric" required />
        </TextField>
        {error && <Alert status="danger">
          <AlertIndicator>
            <AlertCircleIcon />
          </AlertIndicator>
          <AlertContent>
            <AlertDescription>{error}</AlertDescription>
          </AlertContent>
        </Alert>}
        <div className="flex gap-2">
          <Button variant="primary" type="submit" isPending={isSubmitting}>
            {t('submit')}
          </Button>
          {mode === 'change' && (
            <Button variant="secondary" onPress={handleForgetPin}>
              {t('actions.logout')}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
