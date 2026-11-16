import { Spinner, Tab, TabList, Tabs, TextArea } from '@heroui/react';
import type { Key } from '@heroui/react';
import { Languages, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { extractTranslationKeys } from '@attraccess/shared';
import { EmailTemplateType } from '@attraccess/react-query-client';
import { AddLanguageDropdown } from './AddLanguageDropdown';
import { CustomLocaleModal } from './CustomLocaleModal';
import { TranslationDeleteModal } from './TranslationDeleteModal';
import { COMMON_LOCALES, LocaleValues, normalize } from './translationLocales';
import { useLocaleDisplayName } from './useLocaleDisplayName';
import { useTemplateTranslations } from './useTemplateTranslations';
import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';

export interface TranslationsSectionProps {
  templateType: EmailTemplateType;
  liveContent: string;
}

export function TranslationsSection({ templateType, liveContent }: Readonly<TranslationsSectionProps>) {
  const { t } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const toast = useToastMessage();
  const displayName = useLocaleDisplayName();
  const { query, saveMutation, deleteMutation } = useTemplateTranslations(templateType);

  const extractedKeys = useMemo(() => extractTranslationKeys(liveContent), [liveContent]);

  const serverTranslations = useMemo(
    () => (query.data?.translations ?? {}) as Record<string, LocaleValues>,
    [query.data],
  );
  const existingLocales = useMemo(() => Object.keys(serverTranslations), [serverTranslations]);

  const [selectedLocale, setSelectedLocale] = useState('');
  // Languages added this session but not (yet) saved on the server.
  const [addedLocales, setAddedLocales] = useState<string[]>([]);
  // Local edits per language, so switching tabs never discards unsaved work.
  const [editedByLocale, setEditedByLocale] = useState<Record<string, LocaleValues>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [customLocaleOpen, setCustomLocaleOpen] = useState(false);

  const allLocales = useMemo(() => {
    const set = new Set([...existingLocales, ...addedLocales]);
    return Array.from(set).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [existingLocales, addedLocales, displayName]);

  const availableLocales = useMemo(
    () =>
      COMMON_LOCALES.filter((l) => !allLocales.includes(l)).sort((a, b) =>
        displayName(a).localeCompare(displayName(b)),
      ),
    [allLocales, displayName],
  );

  useEffect(() => {
    if ((!selectedLocale || !allLocales.includes(selectedLocale)) && allLocales.length > 0) {
      setSelectedLocale(allLocales[0]);
    }
  }, [allLocales, selectedLocale]);

  const valuesFor = (locale: string): LocaleValues => editedByLocale[locale] ?? serverTranslations[locale] ?? {};
  const isDirty = (locale: string) =>
    editedByLocale[locale] !== undefined && normalize(editedByLocale[locale]) !== normalize(serverTranslations[locale]);
  const filledCount = (locale: string) => {
    const values = valuesFor(locale);
    return extractedKeys.filter(({ key }) => values[key]?.trim()).length;
  };

  const handleAddLanguage = (locale: string) => {
    setAddedLocales((prev) => (prev.includes(locale) ? prev : [...prev, locale]));
    setSelectedLocale(locale);
  };

  const handleEdit = (key: string, value: string) => {
    if (!selectedLocale) return;
    setEditedByLocale((prev) => ({
      ...prev,
      [selectedLocale]: { ...valuesFor(selectedLocale), [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!selectedLocale) return;
    const translations = Object.fromEntries(
      Object.entries(valuesFor(selectedLocale)).filter(([, v]) => v.trim() !== ''),
    );
    try {
      await saveMutation.mutateAsync({ requestBody: { locale: selectedLocale, translations }, type: templateType });
      toast.success({ title: t('translations.saved') });
    } catch {
      toast.error({ title: t('translations.saveFailed') });
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      if (existingLocales.includes(deleteTarget)) {
        await deleteMutation.mutateAsync({ locale: deleteTarget, type: templateType });
      }
      setAddedLocales((prev) => prev.filter((l) => l !== deleteTarget));
      setEditedByLocale((prev) => {
        const next = { ...prev };
        delete next[deleteTarget];
        return next;
      });
      if (selectedLocale === deleteTarget) {
        setSelectedLocale(allLocales.find((l) => l !== deleteTarget) ?? '');
      }
      setDeleteTarget(null);
    } catch {
      toast.error({ title: t('translations.deleteFailed') });
    }
  };

  const addLanguageButton = (
    <AddLanguageDropdown
      availableLocales={availableLocales}
      onAddLanguage={handleAddLanguage}
      onAddCustomLanguage={() => setCustomLocaleOpen(true)}
    />
  );

  if (extractedKeys.length === 0) {
    return (
      <section className="w-full" data-cy="translations-section">
        <p className="text-sm text-default-500">{t('translations.noKeys')}</p>
      </section>
    );
  }

  // Until the server's languages are known, don't render the add/edit UI: the
  // empty state would be factually wrong, and re-adding a not-yet-listed
  // language could silently overwrite its existing translations on save.
  if (query.isLoading) {
    return (
      <section className="w-full flex justify-center py-10" data-cy="translations-section">
        <Spinner size="sm" />
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="w-full flex flex-col items-center gap-3 py-10" data-cy="translations-section">
        <p className="text-sm text-danger">{t('translations.loadFailed')}</p>
        <Button variant="ghost" size="sm" onPress={() => query.refetch()}>
          {t('translations.retry')}
        </Button>
      </section>
    );
  }

  return (
    <section className="w-full flex flex-col gap-4" data-cy="translations-section">
      <p className="text-sm text-default-500">{t('translations.explainer')}</p>

      {allLocales.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default-300 py-10 px-6 text-center"
          data-cy="translations-empty-state"
        >
          <Languages size={32} className="text-default-400" />
          <p className="font-medium">{t('translations.emptyTitle')}</p>
          <p className="text-sm text-default-500 max-w-md">{t('translations.emptyHint')}</p>
          {addLanguageButton}
        </div>
      ) : (
        <>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Tabs selectedKey={selectedLocale} onSelectionChange={(key: Key) => setSelectedLocale(String(key))}>
              <Tabs.ListContainer>
                <TabList>
                  {allLocales.map((locale) => (
                    <Tab id={locale} key={locale} data-cy={`translations-language-tab-${locale}`}>
                      <Tabs.Indicator />
                      <span className="flex items-center gap-1.5">
                        {displayName(locale)}
                        <span className="text-xs text-default-400">
                          {filledCount(locale)}/{extractedKeys.length}
                        </span>
                        {isDirty(locale) && <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />}
                      </span>
                    </Tab>
                  ))}
                </TabList>
              </Tabs.ListContainer>
            </Tabs>
            {selectedLocale && (
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                className="text-danger"
                onPress={() => setDeleteTarget(selectedLocale)}
                aria-label={t('translations.removeLanguage', {
                  language: displayName(selectedLocale),
                })}
                data-cy="translations-remove-language-button"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <div className="ml-auto">{addLanguageButton}</div>
          </div>

          {selectedLocale && !existingLocales.includes(selectedLocale) && (
            <p className="text-sm text-warning" data-cy="translations-unsaved-language-hint">
              {t('translations.unsavedLanguageHint', { language: displayName(selectedLocale) })}
            </p>
          )}

          <div className="flex flex-col gap-3" data-cy="translations-list">
            {extractedKeys.map(({ key, defaultValue }) => (
              <div key={key} className="flex flex-col gap-1.5 rounded-lg border border-default-200 p-3">
                <div className="flex gap-4">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <span className="text-xs uppercase tracking-wide text-default-400">
                      {t('translations.keyColumn')}
                    </span>
                    <span className="font-mono text-sm font-semibold text-default-600 whitespace-pre-wrap">{key}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wide text-default-400">
                      {t('translations.defaultColumn')}
                    </span>
                    <span className="text-sm text-default-600 whitespace-pre-wrap">{defaultValue}</span>
                  </div>
                </div>
                <TextArea
                  value={valuesFor(selectedLocale)[key] ?? ''}
                  onChange={(e) => handleEdit(key, e.target.value)}
                  disabled={!selectedLocale}
                  aria-label={t('translations.translationColumn', {
                    language: displayName(selectedLocale),
                  })}
                  placeholder={t('translations.emptyTranslation')}
                  rows={2}
                  data-cy={`translation-input-${key}`}
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              type="button"
              onPress={handleSave}
              isDisabled={!selectedLocale || !isDirty(selectedLocale)}
              isPending={saveMutation.isPending}
              data-cy="save-translations-button"
            >
              {t('translations.save')}
            </Button>
          </div>
        </>
      )}

      <CustomLocaleModal isOpen={customLocaleOpen} onOpenChange={setCustomLocaleOpen} onAdd={handleAddLanguage} />

      <TranslationDeleteModal
        deleteTarget={deleteTarget}
        isPending={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </section>
  );
}
