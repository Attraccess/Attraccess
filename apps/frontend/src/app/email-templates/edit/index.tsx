import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerPreviewMjml,
  EmailTemplateType,
} from '@attraccess/react-query-client';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Form,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Link,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import Editor from '@monaco-editor/react';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
import { useDebounce } from '../../../hooks/useDebounce';
import { ExpandIcon } from 'lucide-react';
import { useTheme } from '@heroui/use-theme';

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

  const copyVariable = useCallback(
    (name: string) => {
      const token = `{{${name}}}`;
      navigator.clipboard.writeText(token).then(
        () => toast.success({ title: t('variables.copied', { name: token }) }),
        () => toast.error({ title: t('variables.copied', { name: token }) }),
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
                  variant="flat"
                  color="primary"
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
        <Input label={t('form.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
          defaultLanguage="mjml"
          defaultValue={body}
          onChange={(value) => setBody(value ?? '')}
        />
        <Link href="https://documentation.mjml.io/" isExternal showAnchorIcon>
          {t('form.mjmlDocumentation')}
        </Link>
      </>
    );
  }, [body, theme, subject, t, variables, copyVariable]);

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
    <div>
      <PageHeader title={t('templateType.' + templateType)} subtitle={t('subtitle')} backTo="/email-templates" />
      <Form onSubmit={onSubmit}>
        <div className="flex flex-col flex-wrap gap-4 w-full lg:flex-row">
          <Card className="flex-1">
            <CardHeader className="flex flex-row justify-between">
              <span>{t('sections.template')}</span>
              <Button isIconOnly startContent={<ExpandIcon />} onPress={() => setEditorIsExpanded(true)} />
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {editor}

              <Modal isOpen={editorIsExpanded} onOpenChange={setEditorIsExpanded} size="full" hideCloseButton>
                <ModalContent>
                  <ModalHeader>{t('templateType.' + templateType)}</ModalHeader>
                  <ModalBody>{editor}</ModalBody>
                  <ModalFooter>
                    <Button onPress={() => setEditorIsExpanded(false)}>{t('actions.close')}</Button>
                  </ModalFooter>
                </ModalContent>
              </Modal>
            </CardBody>
          </Card>

          <Card className="flex-1">
            <CardHeader>{t('sections.preview')}</CardHeader>
            <CardBody>
              <iframe
                srcDoc={previewHtml}
                title={t('preview.iframeTitle')}
                className="w-full h-full min-h-[435px] border-0"
              />
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-row gap-4 w-full justify-end">
          <Button type="button" variant="light" onPress={() => navigate('/email-templates')}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" color="primary" isLoading={updateTemplate.isPending}>
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
