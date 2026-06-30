import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerPreviewMjml,
  useEmailTemplatesServiceEmailTemplateControllerResetToDefault as useResetTemplateToDefault,
  EmailTemplateType,
} from '@attraccess/react-query-client';
import {
  Chip,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Form,
  Input,
  Label,
  Link,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Tab,
  TabList,
  Tabs,
  TextField,
  useTheme,
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { Button } from '../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import { StandardDrawer } from '../../../components/standardDrawer';
import { StandardModal } from '../../../components/standardModal';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { Maximize, RotateCcw } from 'lucide-react';
import { OpenAPI } from '@attraccess/react-query-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
import { useDebounce } from '../../../hooks/useDebounce';

const VARIABLE_PROVIDER_FLAG = '__attraccessVariableProvider';

function registerVariableProvider(
  monaco: Monaco,
  getVariables: () => string[],
  getDetailLabel: () => string,
) {
  const monacoWithFlag = monaco as Monaco & { [VARIABLE_PROVIDER_FLAG]?: boolean };
  if (monacoWithFlag[VARIABLE_PROVIDER_FLAG]) {
    return;
  }
  monacoWithFlag[VARIABLE_PROVIDER_FLAG] = true;
  if (!monaco.languages.getLanguages().some((lang) => lang.id === 'mjml')) {
    monaco.languages.register({ id: 'mjml', extensions: ['.mjml'], aliases: ['MJML', 'mjml'] });
  }
  monaco.languages.registerCompletionItemProvider('mjml', {
    triggerCharacters: ['{'],
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      let startColumn = word.startColumn;
      while (startColumn > 1 && lineContent[startColumn - 2] === '{') {
        startColumn -= 1;
      }
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: word.endColumn,
      };
      const detail = getDetailLabel();
      return {
        suggestions: getVariables().map((name) => ({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `{{${name}}}`,
          detail,
          range,
        })),
      };
    },
  });
}

interface TranslationKey {
  key: string;
  defaultValue: string;
}

interface TemplateTranslationsResponse {
  keys: TranslationKey[];
  translations: Record<string, Record<string, string>>;
}

function extractTranslationKeys(content: string): TranslationKey[] {
  const regex = /\{\{t\s+["']([^"']+)["']\s+["']([^"']*)["']/g;
  const seen = new Set<string>();
  const keys: TranslationKey[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      keys.push({ key: match[1], defaultValue: match[2] });
    }
  }
  return keys;
}

function useTemplateTranslations(templateType: EmailTemplateType | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<TemplateTranslationsResponse>({
    queryKey: ['email-template-translations', templateType],
    queryFn: async () => {
      const res = await fetch(`${OpenAPI.BASE}/api/email-templates/${templateType}/translations`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load translations');
      return res.json();
    },
    enabled: !!templateType,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ locale, translations }: { locale: string; translations: Record<string, string> }) => {
      const res = await fetch(`${OpenAPI.BASE}/api/email-templates/${templateType}/translations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, translations }),
      });
      if (!res.ok) throw new Error('Failed to save translations');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-template-translations', templateType] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (locale: string) => {
      const res = await fetch(`${OpenAPI.BASE}/api/email-templates/${templateType}/translations/${locale}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete locale');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-template-translations', templateType] });
    },
  });

  return { query, saveMutation, deleteMutation };
}

interface TranslationsSectionProps {
  templateType: EmailTemplateType;
  liveContent: string;
}

function TranslationsSection({ templateType, liveContent }: TranslationsSectionProps) {
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

  // Auto-select first locale when data arrives
  useEffect(() => {
    if (!selectedLocale && existingLocales.length > 0) {
      setSelectedLocale(existingLocales[0]);
    }
  }, [existingLocales, selectedLocale]);

  // Sync edited state when locale or server data changes
  useEffect(() => {
    if (selectedLocale && query.data) {
      setEdited(query.data.translations[selectedLocale] ?? {});
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
      await saveMutation.mutateAsync({ locale: selectedLocale, translations: edited });
      toast.success({ title: t('translations.saved') });
    } catch {
      toast.error({ title: t('translations.saving') });
    }
  };

  const handleDeleteLocale = async (locale: string) => {
    if (!window.confirm(t('translations.deleteConfirm', { locale }))) return;
    await deleteMutation.mutateAsync(locale);
    if (selectedLocale === locale) {
      setSelectedLocale(existingLocales.find((l) => l !== locale) ?? '');
    }
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

      {/* Locale selector + add */}
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
                      onClick={(e) => { e.stopPropagation(); handleDeleteLocale(locale); }}
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
          <input
            className="border border-default-300 rounded px-2 py-1 text-sm w-28 bg-transparent"
            placeholder={t('translations.localePlaceholder')}
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLocale())}
          />
          <Button size="sm" variant="ghost" type="button" onPress={handleAddLocale}>
            {t('translations.addLocale')}
          </Button>
        </div>
      </div>

      {extractedKeys.length === 0 ? (
        <p className="text-sm text-default-500">{t('translations.noKeys')}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-default-200">
                  <th className="text-left py-2 pr-4 font-medium text-default-600 w-1/4">{t('translations.keyColumn')}</th>
                  <th className="text-left py-2 pr-4 font-medium text-default-600 w-1/3">{t('translations.defaultColumn')}</th>
                  <th className="text-left py-2 font-medium text-default-600">{t('translations.translationColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {extractedKeys.map(({ key, defaultValue }) => (
                  <tr key={key} className="border-b border-default-100">
                    <td className="py-2 pr-4 font-mono text-xs text-default-500 align-top pt-3">{key}</td>
                    <td className="py-2 pr-4 text-default-600 align-top pt-3">{defaultValue}</td>
                    <td className="py-2">
                      <input
                        className="w-full border border-default-300 rounded px-2 py-1 text-sm bg-transparent disabled:opacity-50"
                        placeholder={!selectedLocale ? t('translations.locale') : t('translations.emptyTranslation')}
                        value={edited[key] ?? ''}
                        onChange={(e) =>
                          setEdited((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={!selectedLocale}
                        data-cy={`translation-input-${key}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
    </section>
  );
}

export function EditEmailTemplatePage() {
  const navigate = useNavigate();
  const { t } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });

  const { type: templateType } = useParams<{ type: EmailTemplateType }>();

  const { theme } = useTheme();

  const template = useFindOneEmailTemplate({ type: templateType as EmailTemplateType }, undefined, {
    enabled: !!templateType,
  });

  const toast = useToastMessage();
  const variables = useMemo(() => template.data?.variables ?? [], [template.data]);

  const variablesRef = useRef<string[]>([]);
  useEffect(() => {
    variablesRef.current = variables;
  }, [variables]);

  const detailLabelRef = useRef<string>('');
  useEffect(() => {
    detailLabelRef.current = t('variables.completionDetail');
  }, [t]);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    registerVariableProvider(monaco, () => variablesRef.current, () => detailLabelRef.current);
    const model = editor.getModel();
    if (model && model.getLanguageId() !== 'mjml') {
      monaco.editor.setModelLanguage(model, 'mjml');
    }
  }, []);

  const copyVariable = useCallback(
    (name: string) => {
      const token = `{{${name}}}`;
      navigator.clipboard.writeText(token).then(
        () => toast.success({ title: t('variables.copied', { name: token }) }),
        () => toast.error({ title: t('variables.copyFailed', { name: token }) }),
      );
    },
    [t, toast],
  );

  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');

  useEffect(() => {
    if (template.data) {
      setSubject(template.data.subject);
      setBody(template.data.body);
    }
  }, [template.data]);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetTemplate = useResetTemplateToDefault();

  const onResetConfirm = useCallback(() => {
    if (!templateType) return;
    resetTemplate.mutate(
      { type: templateType },
      {
        onSuccess: (data) => {
          setSubject(data.subject);
          setBody(data.body);
          setResetConfirmOpen(false);
          toast.success({ title: t('toast.resetSuccess') });
        },
        onError: () => {
          toast.error({ title: t('toast.resetError') });
        },
      },
    );
  }, [resetTemplate, templateType, toast, t]);

  const updateTemplate = useUpdateEmailTemplate();
  const {
    mutate: parseMjml,
    data: parsedBody,
    isPending: parseMjmlIsPending,
    isError: parseMjmlisError,
    error: parseMjmlError,
  } = useEmailTemplatesServiceEmailTemplateControllerPreviewMjml();

  const debouncedBody = useDebounce(body, 500);
  const bodyIsEmpty = !debouncedBody.trim();

  useEffect(() => {
    if (bodyIsEmpty) {
      return;
    }

    parseMjml({
      requestBody: {
        mjmlContent: debouncedBody,
      },
    });
  }, [bodyIsEmpty, debouncedBody, parseMjml]);

  const previewHtml = useMemo(() => {
    if (bodyIsEmpty) {
      return `<p style="text-align:center; color: #64748b; padding-top: 20px;">${t('preview.emptyPlaceholder')}</p>`;
    }

    if (parseMjmlIsPending) {
      return `<p style="text-align:center; color: #00f; padding-top: 20px;">${t('preview.loading')}</p>`;
    }

    if (parsedBody?.error) {
      return `<p style="text-align:center; color: #f00; padding-top: 20px;">${parsedBody.error}</p>`;
    }

    if (parseMjmlisError) {
      const errorMessage = parseMjmlError instanceof Error ? parseMjmlError.message : String(parseMjmlError);
      return `<p style="text-align:center; color: #f00; padding-top: 20px;">${t('preview.errorPrefix')} ${errorMessage}</p>`;
    }

    return parsedBody?.html;
  }, [bodyIsEmpty, parsedBody, t, parseMjmlIsPending, parseMjmlisError, parseMjmlError]);

  const [editorIsExpanded, setEditorIsExpanded] = useState(false);

  // Content fed to the translations section (debounced for key extraction)
  const debouncedTranslationsContent = useDebounce(subject + '\n' + body, 700);

  const editor = useMemo(() => {
    const variableList = (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('variables.title')}</span>
        {variables.length === 0 ? (
          <span className="text-sm text-default-500">{t('variables.empty')}</span>
        ) : (
          <>
            <span className="text-xs text-default-500">{t('variables.hint')}</span>
            <div className="flex flex-row flex-wrap gap-2">
              {variables.map((name) => (
                <Chip
                  key={name}
                  variant="soft"
                  color="accent"
                  className="cursor-pointer"
                  onClick={() => copyVariable(name)}
                >
                  {name}
                </Chip>
              ))}
            </div>
          </>
        )}
      </div>
    );

    return (
      <>
        {variableList}
        <TextField value={subject} onChange={setSubject}>
          <Label>{t('form.subject')}</Label>
          <Input />
        </TextField>
        <div className="h-[300px] md:h-[60vh]">
          <Editor
            theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
            defaultLanguage="mjml"
            value={body}
            onChange={(value) => setBody(value ?? '')}
            onMount={handleEditorMount}
          />
        </div>
        <Link href="https://documentation.mjml.io/">{t('form.mjmlDocumentation')}</Link>
      </>
    );
  }, [body, theme, subject, t, variables, copyVariable, handleEditorMount]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!templateType) {
        return;
      }

      updateTemplate.mutate({
        requestBody: {
          subject,
          body,
        },
        type: templateType,
      });
    },
    [updateTemplate, subject, body, templateType],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-cy="edit-email-template-page">
      <PageHeader title={t('templateType.' + templateType)} subtitle={t('subtitle')} backTo="/emails/templates" />
      <Form onSubmit={onSubmit} className="gap-8" data-cy="edit-email-template-form">
        <div className="flex flex-col flex-wrap gap-8 w-full lg:flex-row lg:gap-6">
          <section
            className="flex-1 min-w-0 w-full flex flex-col gap-4"
            data-cy="edit-email-template-section-template"
          >
            <div className="flex flex-row items-center justify-between">
              <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
                {t('sections.template')}
              </h3>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={() => setEditorIsExpanded(true)}
                aria-label={t('actions.expand')}
                data-cy="edit-email-template-expand-button"
              >
                <Maximize size={16} />
              </Button>
            </div>
            {editor}

            <StandardDrawer
              isOpen={editorIsExpanded}
              onOpenChange={setEditorIsExpanded}
              dialogProps={{ className: 'md:max-w-5xl' }}
            >
              <DrawerHeader>
                <h2 className="text-lg font-semibold">{t('templateType.' + templateType)}</h2>
              </DrawerHeader>
              <DrawerBody>
                <div className="flex flex-col gap-4 h-full min-h-[60vh]">{editor}</div>
              </DrawerBody>
              <DrawerFooter>
                <Button onPress={() => setEditorIsExpanded(false)}>{t('actions.close')}</Button>
              </DrawerFooter>
            </StandardDrawer>
          </section>

          <section
            className="flex-1 min-w-0 w-full flex flex-col gap-4"
            data-cy="edit-email-template-section-preview"
          >
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">
              {t('sections.preview')}
            </h3>
            <iframe
              srcDoc={previewHtml}
              title={t('preview.iframeTitle')}
              className="w-full h-full min-h-[435px] border-0 rounded-md bg-default-50"
              sandbox="allow-same-origin"
            />
          </section>
        </div>

        <div className="flex flex-row gap-4 w-full justify-end mt-4">
          <Button
            variant="ghost"
            onPress={() => navigate('/emails/templates')}
            data-cy="edit-email-template-cancel-button"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            variant="ghost"
            onPress={() => setResetConfirmOpen(true)}
            data-cy="edit-email-template-reset-button"
          >
            <RotateCcw size={16} />
            {t('actions.resetToDefault')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            isPending={updateTemplate.isPending}
            data-cy="edit-email-template-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>

        {templateType && (
          <TranslationsSection
            templateType={templateType as EmailTemplateType}
            liveContent={debouncedTranslationsContent}
          />
        )}
      </Form>

      <StandardModal isOpen={resetConfirmOpen} onOpenChange={setResetConfirmOpen} size="sm">
        {({ close }) => (
          <>
            <ModalHeader>
              <ModalHeading>{t('resetConfirm.title')}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p>{t('resetConfirm.message')}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close}>
                {t('resetConfirm.cancel')}
              </Button>
              <Button variant="danger" isPending={resetTemplate.isPending} onPress={onResetConfirm}>
                {t('resetConfirm.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </div>
  );
}
