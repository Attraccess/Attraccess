import { useEffect, useMemo, useState } from 'react';
import { EmailTemplateType } from '@attraccess/react-query-client';
import {
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
import { Button } from '../../../components/button';
import { StandardModal } from '../../../components/standardModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { extractTranslationKeys } from '@attraccess/shared';
import { useTemplateTranslations } from './useTemplateTranslations';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';

interface TranslationsSectionProps {
  templateType: EmailTemplateType;
  liveContent: string;
}

export function TranslationsSection({ templateType, liveContent }: TranslationsSectionProps) {
  const { t } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const toast = useToastMessage();
  const { query, saveMutation, deleteMutation } = useTemplateTranslations(templateType);

  const extractedKeys = useMemo(() => extractTranslationKeys(liveContent), [liveContent]);

  const existingLocales = useMemo(
    () => Object.keys(query.data?.translations ?? {}),
    [query.data],
  );

  const [selectedLocale, setSelectedLocale] = useState<string>('');
  const [newLocale, setNewLocale] = useState('');
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedLocale && existingLocales.length > 0) {
      setSelectedLocale(existingLocales[0]);
    }
  }, [existingLocales, selectedLocale]);

  useEffect(() => {
    if (selectedLocale && query.data) {
      setEdited((query.data.translations[selectedLocale] as Record<string, string>) ?? {});
    }
  }, [selectedLocale, query.data]);

  const handleAddLocale = () => {
    const locale = newLocale.trim().toLowerCase();
    if (!locale) return;
    setSelectedLocale(locale);
    setEdited({});
    setNewLocale('');
  };

  const handleSave = async () => {
    if (!selectedLocale) return;
    try {
      await saveMutation.mutateAsync({ requestBody: { locale: selectedLocale, translations: edited }, type: templateType });
      toast.success({ title: t('translations.saved') });
    } catch {
      toast.error({ title: t('translations.saveFailed') });
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync({ locale: deleteTarget, type: templateType });
    if (selectedLocale === deleteTarget) {
      setSelectedLocale(existingLocales.find((l) => l !== deleteTarget) ?? '');
    }
    setDeleteTarget(null);
  };

  const allLocales = useMemo(() => {
    const set = new Set(existingLocales);
    if (selectedLocale) set.add(selectedLocale);
    return Array.from(set);
  }, [existingLocales, selectedLocale]);

  return (
    <section className="w-full flex flex-col gap-4" data-cy="translations-section">
      <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
        {t('sections.translations')}
      </h3>

      <div className="flex flex-row flex-wrap items-center gap-2">
        {allLocales.length > 0 && (
          <Tabs
            selectedKey={selectedLocale}
            onSelectionChange={(key: Key) => setSelectedLocale(String(key))}
          >
            <TabList>
              {allLocales.map((locale) => (
                <Tab id={locale} key={locale}>
                  <div className="flex items-center gap-1">
                    {locale.toUpperCase()}
                    <button
                      type="button"
                      className="text-default-400 hover:text-danger text-xs ml-1"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(locale); }}
                      aria-label={t('translations.deleteLocale')}
                    >
                      ×
                    </button>
                  </div>
                </Tab>
              ))}
            </TabList>
          </Tabs>
        )}
        <div className="flex gap-2 items-center ml-2">
          <TextField
            value={newLocale}
            onChange={setNewLocale}
            aria-label={t('translations.localePlaceholder')}
          >
            <Input
              placeholder={t('translations.localePlaceholder')}
              className="w-28"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocale())}
            />
          </TextField>
          <Button size="sm" variant="ghost" type="button" onPress={handleAddLocale}>
            {t('translations.addLocale')}
          </Button>
        </div>
      </div>

      {extractedKeys.length === 0 ? (
        <p className="text-sm text-default-500">{t('translations.noKeys')}</p>
      ) : (
        <>
          <Table aria-label={t('sections.translations')}>
            <TableScrollContainer>
              <TableContent>
                <TableHeader>
                  <TableColumn isRowHeader>{t('translations.keyColumn')}</TableColumn>
                  <TableColumn>{t('translations.defaultColumn')}</TableColumn>
                  <TableColumn>{t('translations.translationColumn')}</TableColumn>
                </TableHeader>
                <TableBody>
                  {extractedKeys.map(({ key, defaultValue }) => (
                    <TableRow key={key}>
                      <TableCell className="font-mono text-xs text-default-500 align-top">{key}</TableCell>
                      <TableCell className="text-default-600 align-top">{defaultValue}</TableCell>
                      <TableCell>
                        <TextField
                          value={edited[key] ?? ''}
                          onChange={(value) => setEdited((prev) => ({ ...prev, [key]: value }))}
                          isDisabled={!selectedLocale}
                          aria-label={key}
                        >
                          <Input
                            placeholder={!selectedLocale ? t('translations.locale') : t('translations.emptyTranslation')}
                            data-cy={`translation-input-${key}`}
                          />
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>

          {selectedLocale && (
            <div className="flex justify-end">
              <Button
                variant="primary"
                type="button"
                onPress={handleSave}
                isPending={saveMutation.isPending}
                data-cy="save-translations-button"
              >
                {t('translations.save')}
              </Button>
            </div>
          )}
        </>
      )}

      <StandardModal isOpen={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('translations.deleteLocale')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('translations.deleteConfirm', { locale: deleteTarget ?? '' })}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('actions.cancel')}
              </Button>
              <Button variant="danger" isPending={deleteMutation.isPending} onPress={handleDeleteConfirmed}>
                {t('translations.deleteConfirmButton')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </section>
  );
}
