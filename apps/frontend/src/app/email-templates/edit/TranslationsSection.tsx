import { useEffect, useMemo, useState } from 'react';
import { EmailTemplateType } from '@attraccess/react-query-client';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownTrigger,
  Input,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Tab,
  TabList,
  Tabs,
  TextField,
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Languages, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { extractTranslationKeys } from '@attraccess/shared';
import { useTemplateTranslations } from './useTemplateTranslations';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';

// ponytail: curated list instead of a free-text locale input; extend when someone needs more
const COMMON_LOCALES = [
  'en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pt-BR', 'pl', 'cs', 'sk', 'da', 'sv', 'nb', 'fi',
  'ru', 'uk', 'tr', 'ar', 'he', 'ja', 'ko', 'zh', 'zh-TW', 'hi', 'el', 'hu', 'ro', 'bg', 'hr',
  'sl', 'sr', 'lt', 'lv', 'et', 'ca', 'eu', 'ga', 'id', 'th', 'vi',
];

type LocaleValues = Record<string, string>;

const normalize = (values: LocaleValues | undefined) =>
  JSON.stringify(
    Object.entries(values ?? {})
      .filter(([, v]) => v.trim() !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  );

interface TranslationsSectionProps {
  templateType: EmailTemplateType;
  liveContent: string;
}

export function TranslationsSection({ templateType, liveContent }: TranslationsSectionProps) {
  const { t, language } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const toast = useToastMessage();
  const { query, saveMutation, deleteMutation } = useTemplateTranslations(templateType);

  const extractedKeys = useMemo(() => extractTranslationKeys(liveContent), [liveContent]);

  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: 'language' });
    } catch {
      return null;
    }
  }, [language]);
  const displayName = (locale: string) => {
    if (!locale) return '';
    try {
      return languageNames?.of(locale) ?? locale;
    } catch {
      return locale;
    }
  };

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

  const allLocales = useMemo(() => {
    const set = new Set([...existingLocales, ...addedLocales]);
    return Array.from(set).sort((a, b) => displayName(a).localeCompare(displayName(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingLocales, addedLocales, languageNames]);

  const availableLocales = useMemo(
    () =>
      COMMON_LOCALES.filter((l) => !allLocales.includes(l)).sort((a, b) =>
        displayName(a).localeCompare(displayName(b)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allLocales, languageNames],
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
    <Dropdown>
      <DropdownTrigger
        className={`${buttonVariants({ variant: 'primary', size: 'sm' })} inline-flex items-center gap-2`}
        aria-label={t('translations.addLanguage')}
        data-cy="translations-add-language-button"
      >
        <Plus size={16} />
        {t('translations.addLanguage')}
      </DropdownTrigger>
      <DropdownPopover className="max-h-72 overflow-y-auto">
        <DropdownMenu aria-label={t('translations.addLanguage')}>
          {availableLocales.map((locale) => (
            <DropdownItem
              key={locale}
              id={locale}
              onPress={() => handleAddLanguage(locale)}
              data-cy={`translations-add-language-${locale}`}
            >
              {displayName(locale)}
              <span className="ml-2 text-xs text-default-400 uppercase">{locale}</span>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );

  if (extractedKeys.length === 0) {
    return (
      <section className="w-full" data-cy="translations-section">
        <p className="text-sm text-default-500">{t('translations.noKeys')}</p>
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
              <TabList>
                {allLocales.map((locale) => (
                  <Tab id={locale} key={locale} data-cy={`translations-language-tab-${locale}`}>
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
            </Tabs>
            {selectedLocale && (
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                className="text-danger"
                onPress={() => setDeleteTarget(selectedLocale)}
                aria-label={t('translations.removeLanguage', { language: displayName(selectedLocale) })}
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

          <Table aria-label={t('sections.translations')}>
            <TableScrollContainer>
              <TableContent>
                <TableHeader>
                  <TableColumn className="hidden md:table-cell">{t('translations.keyColumn')}</TableColumn>
                  <TableColumn isRowHeader>{t('translations.defaultColumn')}</TableColumn>
                  <TableColumn>
                    {t('translations.translationColumn', { language: displayName(selectedLocale) })}
                  </TableColumn>
                </TableHeader>
                <TableBody>
                  {extractedKeys.map(({ key, defaultValue }) => (
                    <TableRow key={key}>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-default-500 align-top">
                        {key}
                      </TableCell>
                      <TableCell className="text-default-600 align-top">{defaultValue}</TableCell>
                      <TableCell>
                        <TextField
                          value={valuesFor(selectedLocale)[key] ?? ''}
                          onChange={(value) => handleEdit(key, value)}
                          isDisabled={!selectedLocale}
                          aria-label={key}
                        >
                          <Input placeholder={t('translations.emptyTranslation')} data-cy={`translation-input-${key}`} />
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>

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

      <StandardModal isOpen={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>
                {t('translations.removeLanguage', { language: deleteTarget ? displayName(deleteTarget) : '' })}
              </ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('translations.deleteConfirm', { language: deleteTarget ? displayName(deleteTarget) : '' })}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('actions.cancel')}
              </Button>
              <Button
                variant="danger"
                isPending={deleteMutation.isPending}
                onPress={handleDeleteConfirmed}
                data-cy="translations-remove-language-confirm"
              >
                {t('translations.deleteConfirmButton')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </section>
  );
}
