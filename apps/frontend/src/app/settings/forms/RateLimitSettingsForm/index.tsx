import { useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSettingsServiceGetSystemSettings,
  UseSettingsServiceGetSystemSettingsKeyFn,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

const FIELD_KEYS = [
  'ipLoginWindowSeconds',
  'ipLoginMaxRequests',
  'ipEmailTriggerWindowSeconds',
  'ipEmailTriggerMaxRequests',
  'ipTokenActionWindowSeconds',
  'ipTokenActionMaxRequests',
  'accountVerifyResendCooldownSeconds',
  'accountPasswordResetCooldownSeconds',
  'accountLoginMaxFailures',
  'accountLoginLockSeconds',
] as const;

type FieldKey = typeof FIELD_KEYS[number];
type FormState = Record<FieldKey, string>;

export function RateLimitSettingsForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings } = useSettingsServiceGetSystemSettings();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!settings?.rateLimit) return;
    const next = {} as FormState;
    for (const key of FIELD_KEYS) {
      next[key] = String(settings.rateLimit[key]);
    }
    setForm(next);
  }, [settings]);

  const mutateConfig = useMemo(
    () => ({
      onSuccess: () => {
        toast.success({ title: t('success.title'), description: t('success.description') });
        queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetSystemSettingsKeyFn() });
      },
      onError: () => {
        toast.error({ title: t('error.title'), description: t('error.description') });
      },
    }),
    [t, toast, queryClient],
  );

  const { mutate: save, isPending } = useSettingsServiceUpdateSystemSettings(mutateConfig);

  if (!form) return null;

  const handleChange = (key: FieldKey) => (value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {} as Record<FieldKey, number>;
    for (const key of FIELD_KEYS) {
      const parsed = Number.parseInt(form[key], 10);
      if (!Number.isFinite(parsed) || parsed < 0) return;
      payload[key] = parsed;
    }
    save({ requestBody: { rateLimit: payload } });
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} data-testid="rate-limit-form">
      {FIELD_KEYS.map((key) => (
        <Input
          key={key}
          type="number"
          min={0}
          label={t(`fields.${key}`)}
          value={form[key]}
          onValueChange={handleChange(key)}
          data-testid={`rate-limit-${key}`}
        />
      ))}
      <Button
        type="submit"
        color="primary"
        isLoading={isPending}
        isDisabled={isPending}
        data-testid="rate-limit-save"
      >
        {t('save')}
      </Button>
    </form>
  );
}
