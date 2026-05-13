import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerPreviewMjml,
  EmailTemplateType,
} from '@attraccess/react-query-client';
import { Button, Card, Form, Input, Label, Link, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, ModalHeading, TextField, useTheme } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader } from '../../../components/pageHeader';
import Editor from '@monaco-editor/react';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';
import { useDebounce } from '../../../hooks/useDebounce';

export function EditEmailTemplatePage() {
  const navigate = useNavigate();
  const { t } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });

  const { type: templateType } = useParams<{ type: EmailTemplateType }>();

  const { theme } = useTheme();

  const template = useFindOneEmailTemplate({ type: templateType as EmailTemplateType }, undefined, {
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
    return (
      <>
        <TextField value={subject} onChange={setSubject}>
          <Label>{t('form.subject')}</Label>
          <Input />
        </TextField>
        <Editor
          theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
          defaultLanguage="mjml"
          defaultValue={body}
          onChange={(value) => setBody(value ?? '')}
        />
        <Link href="https://documentation.mjml.io/">{t('form.mjmlDocumentation')}</Link>
      </>
    );
  }, [body, theme, subject, t]);

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
            <Card.Header className="flex flex-row justify-between">
              <span>{t('sections.template')}</span>
              <Button isIconOnly onPress={() => setEditorIsExpanded(true)} />
            </Card.Header>
            <Card.Content className="flex flex-col gap-4">
              {editor}

              <Modal isOpen={editorIsExpanded} onOpenChange={setEditorIsExpanded}>
                <ModalBackdrop>
                  <ModalContainer>
                    <ModalDialog>
                      {({ close }) => (
                        <>
                          <ModalHeader>
                            <ModalHeading>{t('templateType.' + templateType)}</ModalHeading>
                          </ModalHeader>
                          <ModalBody>{editor}</ModalBody>
                          <ModalFooter>
                            <Button onPress={close}>{t('actions.close')}</Button>
                          </ModalFooter>
                        </>
                      )}
                    </ModalDialog>
                  </ModalContainer>
                </ModalBackdrop>
              </Modal>
            </Card.Content>
          </Card>

          <Card className="flex-1">
            <Card.Header>{t('sections.preview')}</Card.Header>
            <Card.Content>
              <iframe
                srcDoc={previewHtml}
                title={t('preview.iframeTitle')}
                className="w-full h-full min-h-[435px] border-0"
              />
            </Card.Content>
          </Card>
        </div>

        <div className="flex flex-row gap-4 w-full justify-end">
          <Button variant="ghost" onPress={() => navigate('/email-templates')}>
            {t('actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" isPending={updateTemplate.isPending}>
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
