import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Checkbox, CheckboxGroup, Description, FieldError, Label, Radio, RadioGroup, Spinner } from '@heroui/react';
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
import { cardWritingBlocker } from '../../../attractap/cardWriting';
import API_ERROR_TRANSLATIONS_DE from '../../../../global-translations/api-errors.de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../../global-translations/api-errors.en.json';
import en from './en.json';
import de from './de.json';

type Mode = CardWriterSettingsDto['mode'];

/**
 * Card enrollment: which Attractap readers may enroll and reset RFID cards. Card keys are written
 * through these readers, so an operator can limit the work to readers in a trusted place.
 */
export function AttractapSection() {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useAttractapServiceGetCardWriterSettings();
  const { data: readers, isLoading: readersLoading } = useAttractapServiceGetReaders();

  // A key absent from the draft means "untouched": the field then shows the server's value, so a
  // background refetch can never overwrite what the operator is typing.
  const [draft, setDraft] = useState<Partial<CardWriterSettingsDto>>({});
  const mode: Mode = draft.mode ?? settings?.mode ?? 'all';
  // A deleted reader stays in the stored list; it must neither count as picked nor make the form dirty.
  const existingOnly = (ids: number[]) =>
    readers ? ids.filter((id) => readers.some((reader) => reader.id === id)) : ids;
  const savedReaderIds = existingOnly(settings?.readerIds ?? []);
  const readerIds = draft.readerIds ?? savedReaderIds;

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
  const isDirty = mode !== (settings?.mode ?? 'all') || (mode === 'selected' && !sameIds(readerIds, savedReaderIds));
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
                <Label>{t(`mode.options.${option}.label`)}</Label>
              </Radio.Content>
              <Description>{t(`mode.options.${option}.description`)}</Description>
            </Radio>
          ))}
        </RadioGroup>
      </SettingsRow>

      {mode === 'selected' && (
        <SettingsRow label={t('readers.label')} hint={t('readers.description')} stacked>
          {readersLoading ? (
            <Spinner size="sm" aria-label={t('readers.loading')} data-testid="card-writer-readers-loading" />
          ) : readers?.length ? (
            <CheckboxGroup
              value={readerIds.map(String)}
              onChange={(values) => setDraft((current) => ({ ...current, readerIds: values.map(Number) }))}
              aria-label={t('readers.label')}
              isInvalid={isSaveDisabled}
              data-testid="card-writer-readers"
            >
              {readers.map((reader) => {
                const blocker = cardWritingBlocker(reader);
                return (
                  <Checkbox key={reader.id} value={String(reader.id)}>
                    <Checkbox.Content>
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label>{reader.name}</Label>
                    </Checkbox.Content>
                    {blocker ? (
                      <Description data-testid={`card-writer-reader-${reader.id}-blocker`}>
                        {t(`readers.blockers.${blocker}`)}
                      </Description>
                    ) : null}
                  </Checkbox>
                );
              })}
              <FieldError>{t('readers.required')}</FieldError>
            </CheckboxGroup>
          ) : (
            <Description>{t('readers.none')}</Description>
          )}
        </SettingsRow>
      )}

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={isSaveDisabled}
        onSave={() => save({ requestBody: { mode, readerIds: mode === 'selected' ? readerIds : savedReaderIds } })}
        onDiscard={() => setDraft({})}
      />
    </SettingsSection>
  );
}
