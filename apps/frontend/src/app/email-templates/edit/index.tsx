import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerPreviewMjml,
} from '@attraccess/react-query-client';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
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
import { PageHeader } from '../../../components/pageHeader';
import Editor from '@monaco-editor/react';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
import { useDebounce } from '../../../hooks/useDebounce';
import { ExpandIcon } from 'lucide-react';
import { useTheme } from '@heroui/use-theme';

export function EditEmailTemplatePage() {
  const navigate = useNavigate();
  const { t } = useTranslations('editEmailTemplate', { en: enTranslationsFile, de: deTranslationsFile });

  const { type: templateType } = useParams<{ type: string }>();

  const { theme } = useTheme();

  const template = useFindOneEmailTemplate({ type: templateType as 'verify-email' }, undefined, {
    enabled: !!templateType,
  });

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

  useEffect(() => {
    parseMjml({
      requestBody: {
        mjmlContent: debouncedBody,
      },
    });
  }, [debouncedBody, parseMjml]);

  const previewHtml = useMemo(() => {
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
  }, [parsedBody, t, parseMjmlIsPending, parseMjmlisError, parseMjmlError]);

  const [editorIsExpanded, setEditorIsExpanded] = useState(false);

  const editor = useMemo(() => {
    return (
      <>
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
  }, [body, theme, subject, t]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      updateTemplate.mutate({
        requestBody: {
          subject,
          body,
        },
        type: templateType as 'verify-email' | 'reset-password',
      });
    },
    [updateTemplate, subject, body, templateType]
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
