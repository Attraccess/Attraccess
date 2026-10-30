import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox, CheckboxGroup, Label, Radio, RadioGroup, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  ApiError,
  CardWriterSettingsDto,
  useAttractapServiceGetCardWriterSettings,
  UseAttractapServiceGetCardWriterSettingsKeyFn,
  useAttractapServiceGetReaders,
  useAttractapServiceUpdateCardWriterSettings,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../components/toastProvider';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

type Mode = CardWriterSettingsDto['mode'];

/**
 * Which Attractap readers may enroll and reset cards. Card keys are written through these readers,
 * so an operator can limit the work to readers in a trusted place.
 */
export function AttractapSection() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useAttractapServiceGetCardWriterSettings();
  const { data: readers } = useAttractapServiceGetReaders();

  // A key absent from the draft means "untouched": the field then shows the server's value, so a
  // background refetch can never overwrite what the operator is typing.
  const [draft, setDraft] = useState<Partial<CardWriterSettingsDto>>({});
  const mode: Mode = draft.mode ?? settings?.mode ?? 'all';
  const readerIds = draft.readerIds ?? settings?.readerIds ?? [];

  const { mutate: save, isPending: isSaving } = useAttractapServiceUpdateCardWriterSettings({
    onSuccess(data) {
      toast.success({ title: t('success.title'), description: t('success.description') });
      queryClient.setQueryData(UseAttractapServiceGetCardWriterSettingsKeyFn(), data);
      setDraft({});
    },
    onError(error: Error) {
      toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api' });
    },
  });

  const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id) => b.includes(id));
  const isDirty =
    mode !== (settings?.mode ?? 'all') || (mode === 'selected' && !sameIds(readerIds, settings?.readerIds ?? []));
  // "Selected readers" with nothing selected would silently switch card enrollment off everywhere.
  const isSaveDisabled = mode === 'selected' && readerIds.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <SettingsRow label={t('mode.label')} hint={t('mode.description')} stacked>
        <RadioGroup
          value={mode}
          onChange={(value) => setDraft((current) => ({ ...current, mode: value as Mode }))}
          data-testid="card-writer-mode"
        >
          <Label className="sr-only">{t('mode.label')}</Label>
          {(['all', 'selected'] as const).map((option) => (
            <Radio key={option} value={option} data-testid={`card-writer-mode-${option}`}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                <span className="flex flex-col">
                  <span className="text-small">{t(`mode.options.${option}.label`)}</span>
                  <span className="text-tiny text-muted">{t(`mode.options.${option}.description`)}</span>
                </span>
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      </SettingsRow>

      {mode === 'selected' && (
        <SettingsRow label={t('readers.label')} hint={t('readers.description')} stacked>
          {readers?.length ? (
            <CheckboxGroup
              value={readerIds.map(String)}
              onChange={(values) => setDraft((current) => ({ ...current, readerIds: values.map(Number) }))}
              aria-label={t('readers.label')}
              data-testid="card-writer-readers"
            >
              {readers.map((reader) => (
                <Checkbox key={reader.id} value={String(reader.id)}>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>
                    <Label>{reader.name}</Label>
                  </Checkbox.Content>
                </Checkbox>
              ))}
            </CheckboxGroup>
          ) : (
            <span className="text-sm text-muted">{t('readers.none')}</span>
          )}
          {isSaveDisabled ? <span className="text-sm text-danger">{t('readers.required')}</span> : null}
        </SettingsRow>
      )}

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={isSaveDisabled}
        onSave={() =>
          save({ requestBody: { mode, readerIds: mode === 'selected' ? readerIds : (settings?.readerIds ?? []) } })
        }
        onDiscard={() => setDraft({})}
      />
    </SettingsSection>
  );
}
