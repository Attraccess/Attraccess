import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Radio,
  RadioGroup,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ArrowLeft, Save } from 'lucide-react';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import {
  useResourcesServiceGetOneResourceById,
  useResourcesServiceUpdateOneResource,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  DocumentationType,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import en from './documentationEditor.en.json';
import de from './documentationEditor.de.json';
import { useQueryClient } from '@tanstack/react-query';
import { Markdown } from '../../../components/markdown';

function DocumentationEditorComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const { t } = useTranslations({
    en,
    de,
  });

  const [documentationType, setDocumentationType] = useState<DocumentationType | ''>('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [urlContent, setUrlContent] = useState('');
  const [selectedTab, setSelectedTab] = useState<'edit' | 'preview'>('edit');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const resourceQueryKey = UseResourcesServiceGetOneResourceByIdKeyFn({ id: resourceId });

  const {
    data: resource,
    isLoading: isLoadingResource,
    isError: isResourceError,
    error: resourceError,
    refetch: refetchResource,
  } = useResourcesServiceGetOneResourceById({
    id: resourceId,
  });

  const updateResource = useResourcesServiceUpdateOneResource({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resourceQueryKey });
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      success({
        title: t('notifications.saveSuccess.title'),
        description: t('notifications.saveSuccess.description'),
      });

      navigate(`/resources/${resourceId}`);
    },
    onError: () => {
      showError({
        title: t('notifications.saveError.title'),
        description: t('notifications.saveError.description'),
      });
    },
  });

  useEffect(() => {
    if (resource) {
      if (resource.documentationType) {
        setDocumentationType(resource.documentationType as DocumentationType);
      } else {
        setDocumentationType('');
      }
      setMarkdownContent(resource.documentationMarkdown || '');
      setUrlContent(resource.documentationUrl || '');
    }
  }, [resource]);

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (documentationType === DocumentationType.URL && !urlContent) {
      errors.url = t('validation.urlRequired');
    }

    if (documentationType === DocumentationType.URL && urlContent) {
      try {
        new URL(urlContent);
      } catch {
        errors.url = t('validation.invalidUrl');
      }
    }

    if (documentationType === DocumentationType.MARKDOWN && !markdownContent) {
      errors.markdown = t('validation.markdownRequired');
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [documentationType, markdownContent, urlContent, t]);

  const handleSave = useCallback(() => {
    if (!validateForm() || !resource) {
      return;
    }

    updateResource.mutate({
      id: resourceId,
      formData: {
        documentationType: documentationType || undefined,
        documentationMarkdown: documentationType === DocumentationType.MARKDOWN ? markdownContent : undefined,
        documentationUrl: documentationType === DocumentationType.URL ? urlContent : undefined,
      },
    });
  }, [documentationType, markdownContent, resource, resourceId, updateResource, urlContent, validateForm]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleSave();
    },
    [handleSave]
  );

  if (isLoadingResource) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner data-cy="documentation-editor-loading-spinner" />
      </div>
    );
  }

  if (isResourceError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8" data-cy="documentation-editor-error">
        <PageHeader title={t('error.title')} backTo="/resources" />
        <div className="flex flex-col items-center gap-4 mt-6">
          <p className="text-danger">{resourceError instanceof Error ? resourceError.message : t('error.unknown')}</p>
          <div className="flex gap-4">
            <Button
              variant="primary"
              onPress={() => refetchResource()}
              data-cy="documentation-editor-error-retry-button"
            >
              {t('actions.retry')}
            </Button>
            <Button
              variant="secondary"
              onPress={() => navigate('/resources')}
              data-cy="documentation-editor-error-back-to-resources-button"
            >
              <ArrowLeft size={16} />
              {t('actions.backToResources')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8" data-cy="documentation-editor-not-found">
        <PageHeader title={t('notFound.title')} backTo="/resources" />
        <div className="flex flex-col items-center gap-4 mt-6">
          <p>{t('notFound.message')}</p>
          <Button
            variant="secondary"
            onPress={() => navigate('/resources')}
            data-cy="documentation-editor-not-found-back-to-resources-button"
          >
            <ArrowLeft size={16} />
            {t('actions.backToResources')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-cy="documentation-editor-page">
      <PageHeader
        title={t('title')}
        subtitle={resource.name}
        backTo={`/resources/${resourceId}`}
        actions={[
          {
            key: 'save',
            label: t('actions.save'),
            icon: <Save className="w-4 h-4" />,
            variant: 'primary',
            isPending: updateResource.isPending,
            onPress: handleSave,
            dataCy: 'documentation-editor-header-save-button',
          },
        ]}
      />

      <Form onSubmit={handleSubmit} className="gap-8" data-cy="documentation-editor-form">
        <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
          <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.type')}</h3>
          <RadioGroup
            orientation="horizontal"
            value={documentationType}
            onChange={setDocumentationType as (value: string) => void}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-type-radiogroup"
          >
            <Label className="sr-only">{t('documentationType.label')}</Label>
            <Radio value={DocumentationType.MARKDOWN} data-cy="documentation-editor-type-markdown-radio">
              {t('documentationType.markdown')}
            </Radio>
            <Radio value={DocumentationType.URL} data-cy="documentation-editor-type-url-radio">
              {t('documentationType.url')}
            </Radio>
          </RadioGroup>
        </section>

        {documentationType === DocumentationType.MARKDOWN && (
          <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.content')}</h3>
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(k) => setSelectedTab(k as 'edit' | 'preview')}
              className="w-full"
              data-cy="documentation-editor-markdown-tabs"
            >
              <TabList>
                <Tab id="edit" data-cy="documentation-editor-markdown-edit-tab">
                  {t('edit')}
                </Tab>
                <Tab id="preview" data-cy="documentation-editor-markdown-preview-tab">
                  {t('preview')}
                </Tab>
              </TabList>
              <TabPanel id="edit" className="pt-4">
                <TextField
                  value={markdownContent}
                  onChange={setMarkdownContent}
                  isInvalid={!!validationErrors.markdown}
                  isDisabled={updateResource.isPending}
                  className="w-full"
                >
                  <Label className="sr-only">{t('markdownContent.label')}</Label>
                  <TextArea
                    placeholder={t('markdownContent.placeholder')}
                    className="w-full min-h-[300px] resize-y"
                    data-cy="documentation-editor-markdown-textarea"
                  />
                  {validationErrors.markdown && <FieldError>{validationErrors.markdown}</FieldError>}
                </TextField>
              </TabPanel>
              <TabPanel id="preview" className="pt-4">
                {markdownContent ? (
                  <Markdown className="border border-default-200 rounded-md p-4 min-h-[300px]">
                    {markdownContent}
                  </Markdown>
                ) : (
                  <div className="border border-default-200 rounded-md p-4 min-h-[300px]">
                    <p className="text-default-400 italic">{t('markdownContent.placeholder')}</p>
                  </div>
                )}
              </TabPanel>
            </Tabs>
          </section>
        )}

        {documentationType === DocumentationType.URL && (
          <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('sections.content')}</h3>
            <TextField
              value={urlContent}
              onChange={setUrlContent}
              isInvalid={!!validationErrors.url}
              isDisabled={updateResource.isPending}
              className="w-full"
            >
              <Label>{t('urlContent.label')}</Label>
              <Input placeholder={t('urlContent.placeholder')} data-cy="documentation-editor-url-input" />
              {validationErrors.url && <FieldError>{validationErrors.url}</FieldError>}
            </TextField>
          </section>
        )}

        <div className="flex justify-end gap-3 w-full mt-4">
          <Button
            variant="secondary"
            onPress={() => navigate(`/resources/${resourceId}`)}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-footer-cancel-button"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            isPending={updateResource.isPending}
            data-cy="documentation-editor-footer-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>
      </Form>
    </div>
  );
}

export const DocumentationEditor = memo(DocumentationEditorComponent);
