import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Input,
  Label,
  ProgressCircle,
  ProgressCircleFillCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
  TextField,
} from '@heroui/react';
import { Button } from '../../../../../components/button';
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useCallback, useState, type FormEvent, type PropsWithChildren } from 'react';
import { AttractapSerialConfiguratorPin } from '../Pin';
import de from './de.json';
import en from './en.json';
import { useAttractapSerialComm } from './index.use-attractap-serial-comm';

export function AttractapSerialCommGate({ children }: PropsWithChildren) {
  const { t } = useTranslations({ de, en });
  const { pinIsSet, isAuthenticated, setAuthCode, sendAuthedCommand, refreshPinStatus } = useAttractapSerialComm();

  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePin = useCallback((pin: string) => /^\d{4}$/.test(pin), []);

  const handleUnlock = useCallback(
    async (evt: FormEvent) => {
      evt.preventDefault();
      setError(null);

      if (!validatePin(pinInput)) {
        setError(t('errors.invalid'));
        return;
      }

      setIsSubmitting(true);
      try {
        await sendAuthedCommand('network.status.get', {}, { authCodeOverride: pinInput });
        setAuthCode(pinInput);
      } catch (err) {
        console.error(err);
        setError(t('errors.auth'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [pinInput, sendAuthedCommand, setAuthCode, t, validatePin],
  );

  if (pinIsSet === null) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-4 py-8">
        <ProgressCircle isIndeterminate aria-label={t('loading')}>
          <ProgressCircleTrack>
            <ProgressCircleTrackCircle />
            <ProgressCircleFillCircle />
          </ProgressCircleTrack>
        </ProgressCircle>
        <p className="text-sm text-muted text-center">{t('waitingForDevice')}</p>
        <Button
          variant="secondary"
          onPress={() => refreshPinStatus().catch((err) => console.error('Failed to refresh PIN status', err))}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (!pinIsSet) {
    return <AttractapSerialConfiguratorPin mode="set" />;
  }

  if (!isAuthenticated) {
    return (
      <form className="flex flex-col gap-3" onSubmit={handleUnlock}>
        <TextField value={pinInput} onChange={setPinInput}>
          <Label>{t('fields.pin')}</Label>
          <Input maxLength={4} inputMode="numeric" required />
        </TextField>
        {error && (
          <Alert status="danger">
            <AlertStatusIcon status="danger" />
            <AlertContent>
              <AlertDescription>{error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
        <Button variant="primary" type="submit" isPending={isSubmitting}>
          {t('enterPin.submit')}
        </Button>
      </form>
    );
  }

  return children;
}
