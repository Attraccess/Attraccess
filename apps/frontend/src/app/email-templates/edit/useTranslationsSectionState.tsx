import { useEffect, useMemo, useState } from 'react';
import { Dropdown, DropdownItem, DropdownMenu, DropdownPopover, DropdownTrigger } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Plus } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { extractTranslationKeys } from '@attraccess/shared';
import { useTemplateTranslations } from './useTemplateTranslations';
import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
import { COMMON_LOCALES } from './TranslationsSection.state';
import { LocaleValues } from './TranslationsSection.contracts';
import { normalize } from './TranslationsSection.state';
import { TranslationsSectionProps } from './TranslationsSection.contracts';
export function useTranslationsSectionState({ templateType, liveContent }: TranslationsSectionProps) {
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
  const [customLocaleOpen, setCustomLocaleOpen] = useState(false);
  const [customLocale, setCustomLocale] = useState('');

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
          {[
            ...availableLocales.map((locale) => (
              <DropdownItem
                key={locale}
                id={locale}
                onPress={() => handleAddLanguage(locale)}
                data-cy={`translations-add-language-${locale}`}
              >
                {displayName(locale)}
                <span className="ml-2 text-xs text-default-400 uppercase">{locale}</span>
              </DropdownItem>
            )),
            <DropdownItem
              key="__custom"
              id="__custom"
              onPress={() => {
                setCustomLocale('');
                setCustomLocaleOpen(true);
              }}
              data-cy="translations-add-language-custom"
            >
              {t('translations.customLocale')}
            </DropdownItem>,
          ]}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
  return {
    t,
    language,
    query,
    saveMutation,
    deleteMutation,
    extractedKeys,
    displayName,
    existingLocales,
    selectedLocale,
    setSelectedLocale,
    deleteTarget,
    setDeleteTarget,
    customLocaleOpen,
    setCustomLocaleOpen,
    customLocale,
    setCustomLocale,
    allLocales,
    valuesFor,
    isDirty,
    filledCount,
    handleAddLanguage,
    handleEdit,
    handleSave,
    handleDeleteConfirmed,
    addLanguageButton,
  } as const;
}
