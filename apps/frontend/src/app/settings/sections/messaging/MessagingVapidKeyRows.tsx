import { InputGroup, TextField } from '@heroui/react';
import { RefreshCwIcon } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, StatusDialog, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  UsePushServicePushGetVapidConfigKeyFn,
  usePushServicePushReplaceVapidKeys,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { useToastMessage } from '../../../../components/toastProvider';
import { EMPTY_VAPID_KEY_DRAFT, VapidKeyDraft } from './vapidKeyDraft';
import en from './en.json';
import de from './de.json';

interface MessagingVapidKeyRowsProps {
  /** Subscriptions the replacement would invalidate, from the VAPID config the section loads. */
  subscriptionCount: number;
  /**
   * Held by the section, above its loading gate: a limits refetch after an error shows the spinner
   * and unmounts these rows, and typed keys or an open confirmation must survive that.
   */
  draft: VapidKeyDraft;
  onDraftChange: Dispatch<SetStateAction<VapidKeyDraft>>;
}

/**
 * Replacing the VAPID key pair is destructive and irreversible (it invalidates every existing
 * subscription), so it keeps its own two-step confirmation instead of riding along on Save.
 */
export function MessagingVapidKeyRows({ subscriptionCount, draft, onDraftChange }: MessagingVapidKeyRowsProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { confirmStep, customPublicKey, customPrivateKey, pendingOverride } = draft;
  const update = (patch: Partial<VapidKeyDraft>) => onDraftChange((current) => ({ ...current, ...patch }));

  const { mutate: replaceKeys, isPending: isReplacing } = usePushServicePushReplaceVapidKeys({
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: UsePushServicePushGetVapidConfigKeyFn() });
      onDraftChange(EMPTY_VAPID_KEY_DRAFT);
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
          onPress={() => update({ pendingOverride: undefined, confirmStep: 'warning' })}
        >
          <RefreshCwIcon size={16} />
          {t('regenerateButton')}
        </Button>
      </SettingsRow>

      <SettingsRow stacked label={t('overrideTitle')} hint={t('overrideDescription')}>
        <div className="flex w-full flex-col gap-2">
          <TextField
            value={customPublicKey}
            onChange={(value) => update({ customPublicKey: value })}
            aria-label={t('publicKeyInputLabel')}
          >
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" placeholder={t('publicKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <TextField
            value={customPrivateKey}
            onChange={(value) => update({ customPrivateKey: value })}
            aria-label={t('privateKeyInputLabel')}
          >
            <InputGroup>
              <InputGroup.Input className="font-mono text-sm" type="password" placeholder={t('privateKeyInputLabel')} />
            </InputGroup>
          </TextField>
          <div className="flex">
            <Button
              variant="secondary"
              size="sm"
              isDisabled={!customPublicKey.trim() || !customPrivateKey.trim()}
              onPress={() =>
                update({
                  pendingOverride: { publicKey: customPublicKey.trim(), privateKey: customPrivateKey.trim() },
                  confirmStep: 'warning',
                })
              }
            >
              {t('applyCustomButton')}
            </Button>
          </div>
        </div>
      </SettingsRow>

      <StatusDialog
        isOpen={confirmStep === 'warning'}
        onClose={() => update({ confirmStep: null, pendingOverride: undefined })}
        status="warning"
        title={t('confirmWarning.title')}
        closeLabel={t('confirmWarning.cancel')}
        action={{ label: t('confirmWarning.continue'), onPress: () => update({ confirmStep: 'final' }) }}
      >
        {t('confirmWarning.description', { count: subscriptionCount })}
      </StatusDialog>

      <StatusDialog
        isOpen={confirmStep === 'final'}
        onClose={() => update({ confirmStep: 'warning' })}
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
