import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Separator,
  Spinner,
} from '@heroui/react';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
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

function NumberRow({
  label,
  description,
  value,
  onChange,
  minValue = 1,
  step = 1,
  isDisabled,
  dataTestid,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  minValue?: number;
  step?: number;
  isDisabled?: boolean;
  dataTestid?: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={dataTestid}>
      <span className="text-sm font-medium">{label}</span>
      <NumberField value={value} onChange={onChange} minValue={minValue} step={step} isDisabled={isDisabled}>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
      {description && <span className="text-xs text-default-500">{description}</span>}
    </div>
  );
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
      <NumberRow
        label={t('fields.maxAttempts.label')}
        description={t('fields.maxAttempts.description')}
        value={form.maxAttempts}
        onChange={(value) => setForm({ ...form, maxAttempts: value })}
        dataTestid="rate-limit-max-attempts"
      />
      <NumberRow
        label={t('fields.windowSeconds.label')}
        description={t('fields.windowSeconds.description')}
        value={form.windowSeconds}
        onChange={(value) => setForm({ ...form, windowSeconds: value })}
        dataTestid="rate-limit-window-seconds"
      />
      <NumberRow
        label={t('fields.lockoutDurationSeconds.label')}
        description={t('fields.lockoutDurationSeconds.description')}
        value={form.lockoutDurationSeconds}
        onChange={(value) => setForm({ ...form, lockoutDurationSeconds: value })}
        dataTestid="rate-limit-lockout-duration"
      />
      <Separator />
      <LabeledSwitch
        isSelected={form.exponentialBackoff}
        onChange={(value) => setForm({ ...form, exponentialBackoff: value })}
        data-testid="rate-limit-exponential-backoff"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('fields.exponentialBackoff.label')}</span>
          <span className="text-xs text-default-500">{t('fields.exponentialBackoff.description')}</span>
        </div>
      </LabeledSwitch>
      <NumberRow
        label={t('fields.backoffMultiplier.label')}
        description={t('fields.backoffMultiplier.description')}
        value={form.backoffMultiplier}
        onChange={(value) => setForm({ ...form, backoffMultiplier: value })}
        step={0.1}
        isDisabled={!form.exponentialBackoff}
        dataTestid="rate-limit-backoff-multiplier"
      />
      <div>
        <Button variant="primary" onPress={handleSave} isPending={isPending} isDisabled={!isDirty}>
          {t('saveButton')}
        </Button>
      </div>
    </div>
  );
}
