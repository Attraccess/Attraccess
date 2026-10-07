import { TranslationDeleteModal } from './TranslationDeleteModal';
import { Spinner, Tab, TabList, Tabs, TextArea } from '@heroui/react';
import type { Key } from '@heroui/react';
import { Languages, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { TranslationsSectionProps } from './TranslationsSection.contracts';
import { useTranslationsSectionState } from './useTranslationsSectionState';
import { TranslationsSectionStandardModal } from './TranslationsSectionStandardModal';

// Curated dropdown list; anything else (rarer languages, regional overrides
// like fr-CA) can be added via the validated "Other language…" input below.
// Mirrors the backend DTO validation for translation locales.

export function TranslationsSection({ templateType, liveContent }: TranslationsSectionProps) {
  const model = useTranslationsSectionState({ templateType, liveContent });

  if (model.extractedKeys.length === 0) {
    return (
      <section className="w-full" data-cy="translations-section">
        <p className="text-sm text-default-500">{model.t('translations.noKeys')}</p>
      </section>
    );
  }

  // Until the server's languages are known, don't render the add/edit UI: the
  // empty state would be factually wrong, and re-adding a not-yet-listed
  // language could silently overwrite its existing translations on save.
  if (model.query.isLoading) {
    return (
      <section className="w-full flex justify-center py-10" data-cy="translations-section">
        <Spinner size="sm" />
      </section>
    );
  }
  if (model.query.isError) {
    return (
      <section className="w-full flex flex-col items-center gap-3 py-10" data-cy="translations-section">
        <p className="text-sm text-danger">{model.t('translations.loadFailed')}</p>
        <Button variant="ghost" size="sm" onPress={() => model.query.refetch()}>
          {model.t('translations.retry')}
        </Button>
      </section>
    );
  }

  return (
    <section className="w-full flex flex-col gap-4" data-cy="translations-section">
      <p className="text-sm text-default-500">{model.t('translations.explainer')}</p>

      {model.allLocales.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-default-300 py-10 px-6 text-center"
          data-cy="translations-empty-state"
        >
          <Languages size={32} className="text-default-400" />
          <p className="font-medium">{model.t('translations.emptyTitle')}</p>
          <p className="text-sm text-default-500 max-w-md">{model.t('translations.emptyHint')}</p>
          {model.addLanguageButton}
        </div>
      ) : (
        <>
          <div className="flex flex-row flex-wrap items-center gap-2">
            <Tabs
              selectedKey={model.selectedLocale}
              onSelectionChange={(key: Key) => model.setSelectedLocale(String(key))}
            >
              <Tabs.ListContainer>
                <TabList>
                  {model.allLocales.map((locale) => (
                    <Tab id={locale} key={locale} data-cy={`translations-language-tab-${locale}`}>
                      <Tabs.Indicator />
                      <span className="flex items-center gap-1.5">
                        {model.displayName(locale)}
                        <span className="text-xs text-default-400">
                          {model.filledCount(locale)}/{model.extractedKeys.length}
                        </span>
                        {model.isDirty(locale) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                        )}
                      </span>
                    </Tab>
                  ))}
                </TabList>
              </Tabs.ListContainer>
            </Tabs>
            {model.selectedLocale && (
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                className="text-danger"
                onPress={() => model.setDeleteTarget(model.selectedLocale)}
                aria-label={model.t('translations.removeLanguage', {
                  language: model.displayName(model.selectedLocale),
                })}
                data-cy="translations-remove-language-button"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <div className="ml-auto">{model.addLanguageButton}</div>
          </div>

          {model.selectedLocale && !model.existingLocales.includes(model.selectedLocale) && (
            <p className="text-sm text-warning" data-cy="translations-unsaved-language-hint">
              {model.t('translations.unsavedLanguageHint', { language: model.displayName(model.selectedLocale) })}
            </p>
          )}

          <div className="flex flex-col gap-3" data-cy="translations-list">
            {model.extractedKeys.map(({ key, defaultValue }) => (
              <div key={key} className="flex flex-col gap-1.5 rounded-lg border border-default-200 p-3">
                <div className="flex gap-4">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <span className="text-xs uppercase tracking-wide text-default-400">
                      {model.t('translations.keyColumn')}
                    </span>
                    <span className="font-mono text-sm font-semibold text-default-600 whitespace-pre-wrap">{key}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-xs uppercase tracking-wide text-default-400">
                      {model.t('translations.defaultColumn')}
                    </span>
                    <span className="text-sm text-default-600 whitespace-pre-wrap">{defaultValue}</span>
                  </div>
                </div>
                <TextArea
                  value={model.valuesFor(model.selectedLocale)[key] ?? ''}
                  onChange={(e) => model.handleEdit(key, e.target.value)}
                  disabled={!model.selectedLocale}
                  aria-label={model.t('translations.translationColumn', {
                    language: model.displayName(model.selectedLocale),
                  })}
                  placeholder={model.t('translations.emptyTranslation')}
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
              onPress={model.handleSave}
              isDisabled={!model.selectedLocale || !model.isDirty(model.selectedLocale)}
              isPending={model.saveMutation.isPending}
              data-cy="save-translations-button"
            >
              {model.t('translations.save')}
            </Button>
          </div>
        </>
      )}

      <TranslationsSectionStandardModal {...model} />

      <TranslationDeleteModal model={model} />
    </section>
  );
}
