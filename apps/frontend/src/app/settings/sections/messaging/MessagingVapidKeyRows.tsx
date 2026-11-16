import { InputGroup, TextField } from '@heroui/react';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  usePushServicePushGetVapidConfig,
  UsePushServicePushGetVapidConfigKeyFn,
  usePushServicePushReplaceVapidKeys,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type ConfirmStep = 'warning' | 'final' | null;

/**
 * Replacing the VAPID key pair is destructive and irreversible (it invalidates every existing
 * subscription), so it keeps its own two-step confirmation instead of riding along on Save.
 */
export function MessagingVapidKeyRows() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: vapidConfig } = usePushServicePushGetVapidConfig();
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(null);
  const [customPublicKey, setCustomPublicKey] = useState('');
  const [customPrivateKey, setCustomPrivateKey] = useState('');
  const [pendingOverride, setPendingOverride] = useState<{ publicKey: string; privateKey: string } | undefined>();

  const { mutate: replaceKeys, isPending: isReplacing } = usePushServicePushReplaceVapidKeys({
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: UsePushServicePushGetVapidConfigKeyFn() });
      setConfirmStep(null);
      setPendingOverride(undefined);
      setCustomPublicKey('');
      setCustomPrivateKey('');
      toast.success({
        title: t('keysReplaced.title'),
        description: t('keysReplaced.description', { count: data.deletedSubscriptions }),
      });
    },
    onError() {
      toast.error({ title: t('errors.replaceFailed') });
    },
  });

  return (
    <>
      <SettingsRow label={t('push.regenerateLabel')} hint={t('push.regenerateHint')}>
        <Button
          variant="tertiary"
          size="sm"
          onPress={() => {
            setPendingOverride(undefined);
            setConfirmStep('warning');
          }}
        >
          <RefreshCwIcon size={16} />
          {t('regenerateButton')}
        </Button>
      </SettingsRow>

      <SettingsRow stacked label={t('overrideTitle')} hint={t('overrideDescription')}>
        <div className="flex w-full flex-col gap-2">
          <TextField value={customPublicKey} onChange={setCustomPublicKey} aria-label={t('publicKeyInputLabel')}>
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" placeholder={t('publicKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <TextField value={customPrivateKey} onChange={setCustomPrivateKey} aria-label={t('privateKeyInputLabel')}>
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" type="password" placeholder={t('privateKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <div className="flex">
            <Button
              variant="secondary"
              size="sm"
              isDisabled={!customPublicKey.trim() || !customPrivateKey.trim()}
              onPress={() => {
                setPendingOverride({ publicKey: customPublicKey.trim(), privateKey: customPrivateKey.trim() });
                setConfirmStep('warning');
              }}
            >
              {t('applyCustomButton')}
            </Button>
          </div>
        </div>
      </SettingsRow>

      <StatusDialog
        isOpen={confirmStep === 'warning'}
        onClose={() => {
          setConfirmStep(null);
          setPendingOverride(undefined);
        }}
        status="warning"
        title={t('confirmWarning.title')}
        closeLabel={t('confirmWarning.cancel')}
        action={{ label: t('confirmWarning.continue'), onPress: () => setConfirmStep('final') }}
      >
        {t('confirmWarning.description', { count: vapidConfig?.subscriptionCount ?? 0 })}
      </StatusDialog>

      <StatusDialog
        isOpen={confirmStep === 'final'}
        onClose={() => setConfirmStep('warning')}
        status="error"
        title={t('confirmFinal.title')}
        closeLabel={t('confirmFinal.cancel')}
        action={{
          label: t('confirmFinal.confirm'),
          onPress: () => replaceKeys({ requestBody: pendingOverride ?? {} }),
          isPending: isReplacing,
        }}
      >
        {t('confirmFinal.description')}
      </StatusDialog>
    </>
  );
}
