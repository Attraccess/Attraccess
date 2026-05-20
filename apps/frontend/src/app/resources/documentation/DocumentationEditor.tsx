import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, FieldError, Input, Label, Radio, RadioGroup, Spinner, Tab, TabList, TabPanel, Tabs, TextArea, TextField } from '@heroui/react';
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
import ReactMarkdown from 'react-markdown';
import en from './documentationEditor.en.json';
import de from './documentationEditor.de.json';
import { useQueryClient } from '@tanstack/react-query';

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
  const [selectedTab] = useState('edit');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Get resource query key for cache operations
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
    // Invalidate queries after successful update
    onSuccess: () => {
      // Invalidate the specific resource query
      queryClient.invalidateQueries({ queryKey: resourceQueryKey });
      // Invalidate the resources list query if needed
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });

      success({
        title: t('notifications.saveSuccess.title'),
        description: t('notifications.saveSuccess.description'),
      });

      navigate(`/resources/${resourceId}`);
    },
    // Handle errors
    onError: (error) => {
      showError({
        title: t('notifications.saveError.title'),
        description: t('notifications.saveError.description'),
      });
      console.error('Failed to save documentation:', error);
    },
  });

  // Initialize form with resource data
  useEffect(() => {
    if (resource) {
      // Set the documentation type directly from the resource
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

    // Perform mutation
    updateResource.mutate({
      id: resourceId,
      formData: {
        documentationType: documentationType || undefined,
        documentationMarkdown: documentationType === DocumentationType.MARKDOWN ? markdownContent : undefined,
        documentationUrl: documentationType === DocumentationType.URL ? urlContent : undefined,
      },
    });
  }, [documentationType, markdownContent, resource, resourceId, updateResource, urlContent, validateForm]);

  // Handle loading state
  if (isLoadingResource) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner data-cy="documentation-editor-loading-spinner" />
      </div>
    );
  }

  // Handle error state
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

  // Handle not found state
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
        actions={
          <Button
            variant="primary"
            onPress={handleSave}
            isPending={updateResource.isPending}
            data-cy="documentation-editor-header-save-button"
          >
            <Save className="w-4 h-4" />
            {t('actions.save')}
          </Button>
        }
      />

      <div className="flex flex-col gap-8 mt-6">
        <RadioGroup
          orientation="horizontal"
          value={documentationType}
          onChange={setDocumentationType as (value: string) => void}
          isDisabled={updateResource.isPending}
          data-cy="documentation-editor-type-radiogroup"
        >
          <Radio value={DocumentationType.MARKDOWN} data-cy="documentation-editor-type-markdown-radio">
            {t('documentationType.markdown')}
          </Radio>
          <Radio value={DocumentationType.URL} data-cy="documentation-editor-type-url-radio">
            {t('documentationType.url')}
          </Radio>
        </RadioGroup>

        {documentationType === DocumentationType.MARKDOWN && (
          <Tabs selectedKey={selectedTab} data-cy="documentation-editor-markdown-tabs">
            <TabList>
              <Tab id="edit" data-cy="documentation-editor-markdown-edit-tab">
                {t('edit')}
              </Tab>
              <Tab id="preview" data-cy="documentation-editor-markdown-preview-tab">
                {t('preview')}
              </Tab>
            </TabList>
            <TabPanel id="edit">
              <TextArea
                placeholder={t('markdownContent.placeholder')}
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                aria-invalid={!!validationErrors.markdown}
                disabled={updateResource.isPending}
                data-cy="documentation-editor-markdown-textarea"
              />
            </TabPanel>
            <TabPanel id="preview">
              <div className="border rounded p-4 min-h-[300px] prose max-w-none">
                {markdownContent ? (
                  <ReactMarkdown>{markdownContent}</ReactMarkdown>
                ) : (
                  <p className="text-default-400 italic">{t('markdownContent.placeholder')}</p>
                )}
              </div>
            </TabPanel>
          </Tabs>
        )}

        {documentationType === DocumentationType.URL && (
          <TextField
            value={urlContent}
            onChange={setUrlContent}
            isInvalid={!!validationErrors.url}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-url-input"
          >
            <Label>{t('urlContent.label')}</Label>
            <Input placeholder={t('urlContent.placeholder')} />
            {validationErrors.url && <FieldError>{validationErrors.url}</FieldError>}
          </TextField>
        )}

        <div className="flex justify-end gap-3 w-full mt-4">
          <Button
            variant="ghost"
            onPress={() => navigate(`/resources/${resourceId}`)}
            isDisabled={updateResource.isPending}
            data-cy="documentation-editor-footer-cancel-button"
          >
            {t('actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={handleSave}
            isPending={updateResource.isPending}
            data-cy="documentation-editor-footer-save-button"
          >
            {t('actions.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const DocumentationEditor = memo(DocumentationEditorComponent);
