import { useCallback, useEffect, useState } from 'react';
import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Separator,
  Spinner,
} from '@heroui/react';
import { Button } from '../../../../components/button';
import { HelpCircleIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  MessagingRateLimitSettingsDto,
  useSettingsServiceGetMessagingRateLimitSettings,
  UseSettingsServiceGetMessagingRateLimitSettingsKeyFn,
  useSettingsServiceUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

type FormState = {
  sendMaxPerWindow: number;
  sendWindowSeconds: number;
  contactMaxPerWindow: number;
  contactWindowSeconds: number;
};

function toFormState(value: MessagingRateLimitSettingsDto): FormState {
  return {
    sendMaxPerWindow: value.sendMaxPerWindow,
    sendWindowSeconds: value.sendWindowSeconds,
    contactMaxPerWindow: value.contactMaxPerWindow,
    contactWindowSeconds: value.contactWindowSeconds,
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
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {description && (
          <span title={description} aria-label={description}>
            <HelpCircleIcon size={14} className="text-default-400 cursor-help" />
          </span>
        )}
      </div>
      <NumberField value={value} onChange={onChange} minValue={minValue} step={step} isDisabled={isDisabled}>
        <NumberFieldGroup>
          <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
          <NumberFieldInput />
          <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
        </NumberFieldGroup>
      </NumberField>
    </div>
  );
}

export function MessagingRateLimitForm() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: current, isLoading } = useSettingsServiceGetMessagingRateLimitSettings();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (current) setForm(toFormState(current));
  }, [current]);

  const { mutate, isPending } = useSettingsServiceUpdateMessagingRateLimitSettings({
    onSuccess(updated) {
      setForm(toFormState(updated as MessagingRateLimitSettingsDto));
      queryClient.invalidateQueries({ queryKey: UseSettingsServiceGetMessagingRateLimitSettingsKeyFn() });
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
    (form.sendMaxPerWindow !== current.sendMaxPerWindow ||
      form.sendWindowSeconds !== current.sendWindowSeconds ||
      form.contactMaxPerWindow !== current.contactMaxPerWindow ||
      form.contactWindowSeconds !== current.contactWindowSeconds);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-default-500">{t('description')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberRow
          label={t('fields.sendMaxPerWindow.label')}
          description={t('fields.sendMaxPerWindow.description')}
          value={form.sendMaxPerWindow}
          onChange={(value) => setForm({ ...form, sendMaxPerWindow: value })}
          dataTestid="messaging-rate-limit-send-max"
        />
        <NumberRow
          label={t('fields.sendWindowSeconds.label')}
          description={t('fields.sendWindowSeconds.description')}
          value={form.sendWindowSeconds}
          onChange={(value) => setForm({ ...form, sendWindowSeconds: value })}
          dataTestid="messaging-rate-limit-send-window"
        />
      </div>
      <Separator />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <NumberRow
          label={t('fields.contactMaxPerWindow.label')}
          description={t('fields.contactMaxPerWindow.description')}
          value={form.contactMaxPerWindow}
          onChange={(value) => setForm({ ...form, contactMaxPerWindow: value })}
          dataTestid="messaging-rate-limit-contact-max"
        />
        <NumberRow
          label={t('fields.contactWindowSeconds.label')}
          description={t('fields.contactWindowSeconds.description')}
          value={form.contactWindowSeconds}
          onChange={(value) => setForm({ ...form, contactWindowSeconds: value })}
          dataTestid="messaging-rate-limit-contact-window"
        />
      </div>
      <div>
        <Button variant="primary" onPress={handleSave} isPending={isPending} isDisabled={!isDirty}>
          {t('saveButton')}
        </Button>
      </div>
    </div>
  );
}
