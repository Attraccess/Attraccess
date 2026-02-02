import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  EmailTemplateType,
  useEmailTemplatesServiceEmailTemplateControllerFindOne as useFindOneEmailTemplate,
  useEmailTemplatesServiceEmailTemplateControllerUpdate as useUpdateEmailTemplate,
} from '@attraccess/react-query-client';
import { Button, Card, CardBody, CardHeader, Form, Input, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { EmailEditor, EmailEditorProvider, IEmailTemplate } from 'easy-email-editor';
import { AdvancedType, BasicType, BlockManager, JsonToMjml } from 'easy-email-core';
import { ExtensionProps, MjmlToJson, StandardLayout } from 'easy-email-extensions';
import { PageHeader } from '../../../components/pageHeader';

import '@arco-design/web-react/dist/css/arco.css';
import 'easy-email-editor/lib/style.css';
import 'easy-email-extensions/lib/style.css';

import * as enTranslationsFile from './en.json';
import * as deTranslationsFile from './de.json';

const createEmptyPage = (): IEmailTemplate['content'] => {
  const pageBlock = BlockManager.getBlockByType(BasicType.PAGE);

  if (!pageBlock) {
    throw new Error('EasyEmail Page block is not registered.');
  }

  return pageBlock.create({});
};

export function EditEmailTemplatePage() {
  const navigate = useNavigate();
  const { t } = useTranslations({ en: enTranslationsFile, de: deTranslationsFile });
  const { type: templateType } = useParams<{ type: EmailTemplateType }>();

  const template = useFindOneEmailTemplate({ type: templateType as EmailTemplateType }, undefined, {
    enabled: !!templateType,
  });

  const updateTemplate = useUpdateEmailTemplate();

  const [editorData, setEditorData] = useState<IEmailTemplate | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (!template.data) {
      return;
    }

    let content = createEmptyPage();
    let errorMessage: string | null = null;

    if (template.data.body?.trim()) {
      try {
        content = MjmlToJson(template.data.body);
      } catch (error) {
        console.error('Failed to parse MJML template for EasyEmail editor:', error);
        errorMessage = t('editor.parseError');
        content = createEmptyPage();
      }
    }

    setParseError(errorMessage);
    setEditorData({
      subject: template.data.subject ?? '',
      subTitle: '',
      content,
    });
    setEditorKey((prev) => prev + 1);
  }, [template.data, t]);

  const editorCategories = useMemo<ExtensionProps['categories']>(
    () => [
      {
        label: t('editor.categories.content'),
        active: true,
        blocks: [
          { type: AdvancedType.TEXT },
          { type: AdvancedType.IMAGE, payload: { attributes: { padding: '0px 0px 0px 0px' } } },
          { type: AdvancedType.BUTTON },
          { type: AdvancedType.SOCIAL },
          { type: AdvancedType.DIVIDER },
          { type: AdvancedType.SPACER },
          { type: AdvancedType.HERO },
          { type: AdvancedType.WRAPPER },
        ],
      },
      {
        label: t('editor.categories.layout'),
        active: true,
        displayType: 'column',
        blocks: [
          {
            title: t('editor.layouts.twoColumns'),
            payload: [
              ['50%', '50%'],
              ['33%', '67%'],
              ['67%', '33%'],
              ['25%', '75%'],
              ['75%', '25%'],
            ],
          },
          {
            title: t('editor.layouts.threeColumns'),
            payload: [
              ['33.33%', '33.33%', '33.33%'],
              ['25%', '25%', '50%'],
              ['50%', '25%', '25%'],
            ],
          },
          {
            title: t('editor.layouts.fourColumns'),
            payload: [['25%', '25%', '25%', '25%']],
          },
        ],
      },
    ],
    [t],
  );

  const editorHeight = 'calc(100vh - 320px)';

  if (template.isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner size="lg" label={t('loading')} />
      </div>
    );
  }

  if (template.isError) {
    return (
      <Card className="max-w-xl mx-auto my-8">
        <CardHeader>
          <h2 className="text-xl">{t('error.title')}</h2>
        </CardHeader>
        <CardBody>
          <p className="text-danger">
            {template.error instanceof Error ? template.error.message : t('error.unknown')}
          </p>
        </CardBody>
        <div className="flex justify-center gap-4 p-4">
          <Button variant="light" onPress={() => navigate('/email-templates')}>
            {t('actions.cancel')}
          </Button>
        </div>
      </Card>
    );
  }

  if (!editorData) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner size="lg" label={t('loading')} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('templateType.' + templateType)} subtitle={t('subtitle')} backTo="/email-templates" />
      <EmailEditorProvider key={editorKey} data={editorData} height={editorHeight} autoComplete dashed={false}>
        {(formState, formApi) => {
          const { values } = formState;

          const onSubmit = (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();

            if (!templateType) {
              return;
            }

            const body = JsonToMjml({
              data: values.content,
              mode: 'production',
            });

            updateTemplate.mutate({
              requestBody: {
                subject: values.subject,
                body,
              },
              type: templateType,
            });
          };

          return (
            <Form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Input
                label={t('form.subject')}
                value={values.subject}
                onChange={(e) => formApi.change('subject', e.target.value)}
              />

              {parseError ? <p className="text-warning text-sm">{parseError}</p> : null}

              <Card>
                <CardHeader>{t('sections.template')}</CardHeader>
                <CardBody className="p-0">
                  <StandardLayout categories={editorCategories} showSourceCode>
                    <EmailEditor />
                  </StandardLayout>
                </CardBody>
              </Card>

              <div className="flex flex-row gap-4 w-full justify-end">
                <Button type="button" variant="light" onPress={() => navigate('/email-templates')}>
                  {t('actions.cancel')}
                </Button>
                <Button type="submit" color="primary" isLoading={updateTemplate.isPending}>
                  {t('actions.save')}
                </Button>
              </div>
            </Form>
          );
        }}
      </EmailEditorProvider>
    </div>
  );
}
