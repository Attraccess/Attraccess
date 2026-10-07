import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  usePushServicePushGetVapidConfig,
  UsePushServicePushGetVapidConfigKeyFn,
  usePushServicePushReplaceVapidKeys,
  useSettingsServiceGetMessagingRateLimitSettings,
  UseSettingsServiceGetMessagingRateLimitSettingsKeyFn,
  useSettingsServiceUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';
import { LimitKey } from './index.contracts';
import { LIMIT_KEYS } from './index.limit-keys';
import { ConfirmStep } from './index.contracts';
export function useMessagingSectionState() {
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

  // Loading and failure both land here: the query is settled and returned nothing usable. Without
  // this, `valueOf` falls back to NaN for every key, `Object.is(NaN, undefined)` is false, and the
  // section paints an "unsaved changes" bar over four blank fields with no edit behind it — Save
  // disabled because NaN is not an integer, Discard powerless because the draft is already empty.
  const areLimitsReady = limits !== undefined;

  // NaN is React Aria's value for a cleared NumberField, and it keeps the field controlled.
  const valueOf = (key: LimitKey) => draft[key] ?? limits?.[key] ?? NaN;
  // A cleared field is still a departure from the saved value: the bar must stay mounted so Discard
  // is reachable, but Save has to be blocked. Treating NaN as "not dirty" would unmount the bar and
  // strand the operator with an empty field and no way back.
  const isDirty = areLimitsReady && LIMIT_KEYS.some((key) => !Object.is(valueOf(key), limits?.[key]));
  const isSavable = LIMIT_KEYS.every((key) => {
    const value = valueOf(key);
    return Number.isInteger(value) && value >= 1;
  });
  return {
    t,
    isLoading,
    setDraft,
    confirmStep,
    setConfirmStep,
    customPublicKey,
    setCustomPublicKey,
    customPrivateKey,
    setCustomPrivateKey,
    pendingOverride,
    setPendingOverride,
    vapidConfig,
    saveLimits,
    isSaving,
    replaceKeys,
    isReplacing,
    copyPublicKey,
    areLimitsReady,
    valueOf,
    isDirty,
    isSavable,
  } as const;
}
