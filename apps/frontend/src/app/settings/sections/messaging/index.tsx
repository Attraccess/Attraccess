import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  InputGroup,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Spinner,
  TextField,
  Tooltip,
  TooltipContent,
} from '@heroui/react';
import { ClipboardCopyIcon, RefreshCwIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MessagingRateLimitSettingsDto,
  usePushServicePushGetVapidConfig,
  UsePushServicePushGetVapidConfigKeyFn,
  usePushServicePushReplaceVapidKeys,
  useSettingsServiceGetMessagingRateLimitSettings,
  UseSettingsServiceGetMessagingRateLimitSettingsKeyFn,
  useSettingsServiceUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type LimitKey = keyof MessagingRateLimitSettingsDto;

const LIMIT_KEYS: LimitKey[] = [
  'sendMaxPerWindow',
  'sendWindowSeconds',
  'contactMaxPerWindow',
  'contactWindowSeconds',
];

type ConfirmStep = 'warning' | 'final' | null;

/**
 * Messaging limits and the push transport.
 *
 * Only the four rate limits are form state, so they are what the save bar commits. Replacing the
 * VAPID key pair is destructive and irreversible — it invalidates every existing subscription — so
 * it keeps its own two-step confirmation instead of riding along on Save.
 */
export function MessagingSection() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: limits, isLoading } = useSettingsServiceGetMessagingRateLimitSettings();
  // Derived draft: an untouched field falls back to the server's value, so a background refetch
  // cannot overwrite an unsaved edit (ATT-868).
  const [draft, setDraft] = useState<Partial<Record<LimitKey, number>>>({});

  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(null);
  const [customPublicKey, setCustomPublicKey] = useState('');
  const [customPrivateKey, setCustomPrivateKey] = useState('');
  const [pendingOverride, setPendingOverride] = useState<{ publicKey: string; privateKey: string } | undefined>();

  const { data: vapidConfig } = usePushServicePushGetVapidConfig();

  const { mutate: saveLimits, isPending: isSaving } = useSettingsServiceUpdateMessagingRateLimitSettings({
    onSuccess(data) {
      // Prime from the response and release the pin in the same tick — see MonitoringSection.
      queryClient.setQueryData(UseSettingsServiceGetMessagingRateLimitSettingsKeyFn(), data);
      setDraft({});
      toast.success({ title: t('saved.title'), description: t('saved.description') });
    },
    onError() {
      toast.error({ title: t('error.title'), description: t('error.description') });
    },
  });

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

  const copyPublicKey = useCallback(async () => {
    if (!vapidConfig?.publicKey || !navigator?.clipboard?.writeText) {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
      return;
    }
    try {
      await navigator.clipboard.writeText(vapidConfig.publicKey);
      toast.success({ title: t('copied.title'), description: t('copied.description') });
    } catch {
      toast.error({ title: t('copyFailed.title'), description: t('copyFailed.description') });
    }
  }, [toast, t, vapidConfig?.publicKey]);

  // NaN is React Aria's value for a cleared NumberField, and it keeps the field controlled.
  const valueOf = (key: LimitKey) => draft[key] ?? limits?.[key] ?? NaN;
  // A cleared field is still a departure from the saved value: the bar must stay mounted so Discard
  // is reachable, but Save has to be blocked. Treating NaN as "not dirty" would unmount the bar and
  // strand the operator with an empty field and no way back.
  const isDirty = LIMIT_KEYS.some((key) => !Object.is(valueOf(key), limits?.[key]));
  const isSavable = LIMIT_KEYS.every((key) => {
    const value = valueOf(key);
    return Number.isInteger(value) && value >= 1;
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  const aside = (
    <>
      <TextField value={vapidConfig?.publicKey ?? ''} isReadOnly>
        <span className="text-sm font-semibold text-foreground">{t('publicKeyLabel')}</span>
        <InputGroup>
          <InputGroup.Input className="font-mono text-sm" />
          <InputGroup.Suffix>
            <Tooltip>
              <Button variant="ghost" isIconOnly aria-label={t('copyButton')} onPress={copyPublicKey}>
                <ClipboardCopyIcon size={16} />
              </Button>
              <TooltipContent>{t('copyButton')}</TooltipContent>
            </Tooltip>
          </InputGroup.Suffix>
        </InputGroup>
      </TextField>
      <p className="text-xs text-muted">{t('aside.publicKeyHint', { count: vapidConfig?.subscriptionCount ?? 0 })}</p>
    </>
  );

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <div className="flex flex-col">
        {LIMIT_KEYS.map((key) => (
          <SettingsRow
            key={key}
            data-testid={`messaging-limit-row-${key}`}
            label={t(`fields.${key}.label`)}
            hint={t(`fields.${key}.description`)}
          >
            <NumberField
              aria-label={t(`fields.${key}.label`)}
              value={valueOf(key)}
              minValue={1}
              onChange={(next) => setDraft((current) => ({ ...current, [key]: next }))}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
          </SettingsRow>
        ))}

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
                <InputGroup.Input
                  className="font-mono text-sm"
                  type="password"
                  placeholder={t('privateKeyInputLabel')}
                />
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
      </div>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={!isSavable}
        onSave={() => {
          if (!isSavable) return;
          saveLimits({
            requestBody: {
              sendMaxPerWindow: valueOf('sendMaxPerWindow'),
              sendWindowSeconds: valueOf('sendWindowSeconds'),
              contactMaxPerWindow: valueOf('contactMaxPerWindow'),
              contactWindowSeconds: valueOf('contactWindowSeconds'),
            },
          });
        }}
        onDiscard={() => setDraft({})}
      />

      <StandardModal
        isOpen={confirmStep === 'warning'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
        size="sm"
      >
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmWarning.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmWarning.description', { count: vapidConfig?.subscriptionCount ?? 0 })}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('confirmWarning.cancel')}
              </Button>
              <Button variant="tertiary" onPress={() => setConfirmStep('final')}>
                {t('confirmWarning.continue')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>

      <StandardModal
        isOpen={confirmStep === 'final'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmStep(null);
            setPendingOverride(undefined);
          }
        }}
        size="sm"
      >
        {() => (
          <>
            <ModalHeader>
              <ModalHeading>{t('confirmFinal.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('confirmFinal.description')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={() => setConfirmStep('warning')}>
                {t('confirmFinal.cancel')}
              </Button>
              <Button
                variant="danger"
                isPending={isReplacing}
                onPress={() => replaceKeys({ requestBody: pendingOverride ?? {} })}
              >
                {t('confirmFinal.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </SettingsSection>
  );
}

export default MessagingSection;
