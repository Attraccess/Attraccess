import { useCallback, useEffect, useState } from 'react';
import { Button, Divider, NumberInput, Spinner, Switch } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuthRateLimitSettingsDto,
  useSettingsServiceGetAuthRateLimitSettings,
  UseSettingsServiceGetAuthRateLimitSettingsKeyFn,
  useSettingsServiceUpdateAuthRateLimitSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type FormState = {
  maxAttempts: number;
  windowSeconds: number;
  lockoutDurationSeconds: number;
  exponentialBackoff: boolean;
  backoffMultiplier: number;
};

function toFormState(value: AuthRateLimitSettingsDto): FormState {
  return {
    maxAttempts: value.maxAttempts,
    windowSeconds: value.windowSeconds,
    lockoutDurationSeconds: value.lockoutDurationSeconds,
    exponentialBackoff: value.exponentialBackoff,
    backoffMultiplier: value.backoffMultiplier,
  };
}

export function AuthRateLimitForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = useSettingsServiceGetAuthRateLimitSettings();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (current) setForm(toFormState(current));
  }, [current]);

  const { mutate, isPending } = useSettingsServiceUpdateAuthRateLimitSettings({
    onSuccess(updated) {
      setForm(toFormState(updated as AuthRateLimitSettingsDto));
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetAuthRateLimitSettingsKeyFn() });
      toast.success({ title: t('saved.title'), description: t('saved.description') });
    },
    onError() {
      toast.error({ title: t('error.title'), description: t('error.description') });
    },
  });

  const handleSave = useCallback(() => {
    if (!form) return;
    mutate({ requestBody: form });
  }, [form, mutate]);

  if (isLoading || !form) {
    return (
      <div className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" />
        {t('loading')}
      </div>
    );
  }

  const isDirty =
    !!current &&
    (form.maxAttempts !== current.maxAttempts ||
      form.windowSeconds !== current.windowSeconds ||
      form.lockoutDurationSeconds !== current.lockoutDurationSeconds ||
      form.exponentialBackoff !== current.exponentialBackoff ||
      form.backoffMultiplier !== current.backoffMultiplier);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-default-500">{t('description')}</p>
      <NumberInput
        label={t('fields.maxAttempts.label')}
        description={t('fields.maxAttempts.description')}
        value={form.maxAttempts}
        onValueChange={(value) => setForm({ ...form, maxAttempts: value })}
        minValue={1}
        step={1}
        variant="bordered"
        data-testid="rate-limit-max-attempts"
      />
      <NumberInput
        label={t('fields.windowSeconds.label')}
        description={t('fields.windowSeconds.description')}
        value={form.windowSeconds}
        onValueChange={(value) => setForm({ ...form, windowSeconds: value })}
        minValue={1}
        step={1}
        variant="bordered"
        data-testid="rate-limit-window-seconds"
      />
      <NumberInput
        label={t('fields.lockoutDurationSeconds.label')}
        description={t('fields.lockoutDurationSeconds.description')}
        value={form.lockoutDurationSeconds}
        onValueChange={(value) => setForm({ ...form, lockoutDurationSeconds: value })}
        minValue={1}
        step={1}
        variant="bordered"
        data-testid="rate-limit-lockout-duration"
      />
      <Divider />
      <Switch
        isSelected={form.exponentialBackoff}
        onValueChange={(value) => setForm({ ...form, exponentialBackoff: value })}
        data-testid="rate-limit-exponential-backoff"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('fields.exponentialBackoff.label')}</span>
          <span className="text-xs text-default-500">{t('fields.exponentialBackoff.description')}</span>
        </div>
      </Switch>
      <NumberInput
        label={t('fields.backoffMultiplier.label')}
        description={t('fields.backoffMultiplier.description')}
        value={form.backoffMultiplier}
        onValueChange={(value) => setForm({ ...form, backoffMultiplier: value })}
        minValue={1}
        step={0.1}
        variant="bordered"
        isDisabled={!form.exponentialBackoff}
        data-testid="rate-limit-backoff-multiplier"
      />
      <div>
        <Button color="primary" onPress={handleSave} isLoading={isPending} isDisabled={!isDirty}>
          {t('saveButton')}
        </Button>
      </div>
    </div>
  );
}
