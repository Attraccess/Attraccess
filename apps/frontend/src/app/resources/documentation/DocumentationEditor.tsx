import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Radio,
  RadioGroup,
  Spinner,
  Tab,
  Tabs,
  Textarea,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ArrowLeft, Save } from 'lucide-react';
import { useToastMessage } from '../../../components/toastProvider';
import { PageHeader } from '../../../components/pageHeader';
import {
  useResourcesServiceGetOneResourceById,
  useResourcesServiceUpdateOneResource,
  UseResourcesServiceGetOneResourceByIdKeyFn,
  documentationType as DocumentationType, // alias for local usage
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
  const [selectedTab, setSelectedTab] = useState('edit');
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
      queryClient.invalidateQueries({ queryKey: ['ResourcesService', 'getAllResources'] });

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
        <Spinner size="lg" label={t('loading')} data-cy="documentation-editor-loading-spinner" />
      </div>
    );
  }

  // Handle error state
  if (isResourceError) {
    return (
      <Card className="max-w-xl mx-auto my-8">
        <CardHeader>
          <h2 className="text-xl">{t('error.title')}</h2>
        </CardHeader>
        <CardBody>
          <p className="text-danger">{resourceError instanceof Error ? resourceError.message : t('error.unknown')}</p>
        </CardBody>
        <CardFooter className="flex justify-center gap-4">
          <Button onPress={() => refetchResource()} color="primary" data-cy="documentation-editor-error-retry-button">
            {t('actions.retry')}
          </Button>
          <Button
            onPress={() => navigate('/resources')}
            variant="flat"
            startContent={<ArrowLeft size={16} />}
            data-cy="documentation-editor-error-back-to-resources-button"
          >
            {t('actions.backToResources')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Handle not found state
  if (!resource) {
    return (
      <Card className="max-w-xl mx-auto my-8">
        <CardHeader>
          <h2 className="text-xl">{t('notFound.title')}</h2>
        </CardHeader>
        <CardBody>
          <p>{t('notFound.message')}</p>
        </CardBody>
        <CardFooter className="justify-center">
          <Button
            onPress={() => navigate('/resources')}
            variant="flat"
            startContent={<ArrowLeft size={16} />}
            data-cy="documentation-editor-not-found-back-to-resources-button"
          >
            {t('actions.backToResources')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('title')}
        subtitle={resource.name}
        backTo={`/resources/${resourceId}`}
        actions={
          <Button
            color="primary"
            onPress={handleSave}
            isLoading={updateResource.isPending}
            startContent={<Save className="w-4 h-4" />}
            data-cy="documentation-editor-header-save-button"
          >
            {t('actions.save')}
          </Button>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <RadioGroup
            label={t('documentationType.label')}
            orientation="horizontal"
            value={documentationType}
            onValueChange={setDocumentationType as (value: string) => void}
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
        </CardHeader>
        <CardBody>
          {documentationType === DocumentationType.MARKDOWN && (
            <Tabs
              selectedKey={selectedTab}
              onSelectionChange={(key) => setSelectedTab(key.toString())}
              data-cy="documentation-editor-markdown-tabs"
            >
              <Tab key="edit" title={t('edit')} data-cy="documentation-editor-markdown-edit-tab">
                <Textarea
                  label={t('markdownContent.label')}
                  placeholder={t('markdownContent.placeholder')}
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  minRows={15}
                  isInvalid={!!validationErrors.markdown}
                  errorMessage={validationErrors.markdown}
                  isDisabled={updateResource.isPending}
                  data-cy="documentation-editor-markdown-textarea"
                />
              </Tab>
              <Tab key="preview" title={t('preview')} data-cy="documentation-editor-markdown-preview-tab">
                <div className="border rounded p-4 min-h-[300px] prose max-w-none">
                  {markdownContent ? (
                    <ReactMarkdown>{markdownContent}</ReactMarkdown>
                  ) : (
                    <p className="text-default-400 italic">{t('markdownContent.placeholder')}</p>
                  )}
                </div>
              </Tab>
            </Tabs>
          )}

          {documentationType === DocumentationType.URL && (
            <Input
              label={t('urlContent.label')}
              placeholder={t('urlContent.placeholder')}
              value={urlContent}
              onChange={(e) => setUrlContent(e.target.value)}
              isInvalid={!!validationErrors.url}
              errorMessage={validationErrors.url}
              isDisabled={updateResource.isPending}
              data-cy="documentation-editor-url-input"
            />
          )}
        </CardBody>
        <CardFooter>
          <div className="flex justify-end space-x-2">
            <Button
              variant="light"
              onPress={() => navigate(`/resources/${resourceId}`)}
              isDisabled={updateResource.isPending}
              data-cy="documentation-editor-footer-cancel-button"
            >
              {t('actions.cancel')}
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={updateResource.isPending}
              data-cy="documentation-editor-footer-save-button"
            >
              {t('actions.save')}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export const DocumentationEditor = memo(DocumentationEditorComponent);
