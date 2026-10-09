import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { validateDateTimeLocale, DATE_TIME_LOCALE_MAX_LENGTH } from '@attraccess/shared';
import { useDateTimeFormatter, useDateTimePreferences, useTranslations } from '@attraccess/plugins-frontend-ui';
import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import {
  useUsersServiceGetCurrent,
  UseUsersServiceGetCurrentKeyFn,
  useUsersServiceUpdateMyDateTimePreferences,
} from '@attraccess/react-query-client';
import { Select } from '../../../components/select';
import { Button } from '../../../components/button';
import { useToastMessage } from '../../../components/toastProvider';
import en from './en.json';
import de from './de.json';

const EXAMPLE_DATE = new Date(2026, 10, 23, 17, 45, 30);

export function DateTimePreferencesForm() {
  const { t } = useTranslations({ en, de });
  const { data: user, isLoading } = useUsersServiceGetCurrent();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const toast = useToastMessage();
  const identity = useRef(user?.id);
  identity.current = user?.id;
  const saved = user?.dateTimeLocale ?? null;
  useEffect(() => {
    setCustom(saved !== null);
    setDraft(saved ?? '');
  }, [user?.id, saved]);
  const validation = validateDateTimeLocale(draft);
  const locale = custom ? validation.locale : null;
  const invalid = custom && !!validation.error;
  const formatPreview = useDateTimeFormatter({ dateTimeLocale: locale ?? null, showSeconds: true });

  const { mutate, isPending } = useUsersServiceUpdateMyDateTimePreferences({
    onSuccess: (updated) => {
      if (identity.current !== updated.id || useDateTimePreferences.getState().userId !== updated.id) return;
      queryClient.setQueryData(UseUsersServiceGetCurrentKeyFn(), updated);
      useDateTimePreferences.setState({ dateTimeLocale: updated.dateTimeLocale });
      setCustom(updated.dateTimeLocale !== null);
      setDraft(updated.dateTimeLocale ?? '');
      toast.success({ title: t('saved') });
    },
    onError: () => toast.error({ title: t('error') }),
  });

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted">{t('description')}</p>
      <Select
        label={t('mode')}
        value={custom ? 'custom' : 'language'}
        onChange={(value) => setCustom(value === 'custom')}
        items={[
          { key: 'language', label: t('languageDefault') },
          { key: 'custom', label: t('custom') },
        ]}
        isDisabled={isLoading || isPending || !user}
        data-cy="date-time-mode"
      />
      {custom && (
        <TextField value={draft} onChange={setDraft} isInvalid={invalid} isDisabled={isLoading || isPending || !user}>
          <Label>{t('locale')}</Label>
          <Input maxLength={DATE_TIME_LOCALE_MAX_LENGTH} placeholder="en-GB" data-cy="date-time-locale" />
          <Description>{t('examples')}</Description>
          <FieldError>{invalid ? t(validation.error === 'unsupported' ? 'unsupported' : 'invalid') : null}</FieldError>
        </TextField>
      )}
      <div role="status" className="rounded-lg bg-default-100 p-4">
        <p className="text-sm text-muted">{t('preview')}</p>
        <p className="font-medium">{invalid ? '—' : formatPreview(EXAMPLE_DATE)}</p>
      </div>
      <Button
        variant="primary"
        aria-label={t('save')}
        isPending={isPending}
        isDisabled={!user || isLoading || isPending || invalid || locale === saved}
        onPress={() => mutate({ requestBody: { dateTimeLocale: locale ?? null } })}
        data-cy="save-date-time-preferences"
      >
        {t('save')}
      </Button>
    </div>
  );
}
