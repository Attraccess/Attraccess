import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerPreviewMjml,
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
  TextField,
  useTheme,
} from '@heroui/react';
import { Button } from '../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import { StandardDrawer } from '../../../components/standardDrawer';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { Maximize } from 'lucide-react';

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
      return `<p style="text-align:center; color: #f00; padding-top: 20px;">${t('preview.errorPrefix')} ${
        (parseMjmlError as Error).message
      }</p>`;
    }

    return parsedBody?.html;
  }, [bodyIsEmpty, parsedBody, t, parseMjmlIsPending, parseMjmlisError, parseMjmlError]);

  const [editorIsExpanded, setEditorIsExpanded] = useState(false);

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
      <PageHeader title={t('templateType.' + templateType)} subtitle={t('subtitle')} backTo="/email-templates" />
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
            />
          </section>
        </div>

        <div className="flex flex-row gap-4 w-full justify-end mt-4">
          <Button
            variant="ghost"
            onPress={() => navigate('/email-templates')}
            data-cy="edit-email-template-cancel-button"
          >
            {t('actions.cancel')}
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
      </Form>
    </div>
  );
}
