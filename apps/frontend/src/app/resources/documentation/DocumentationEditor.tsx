import { memo } from 'react';
import { Spinner } from '@heroui/react';
import { Button } from '../../../components/button';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { useDocumentationEditorComponentState } from './useDocumentationEditorComponentState';
import { DocumentationEditorComponentDocumentationEditorPage } from './DocumentationEditorComponentDocumentationEditorPage';

function DocumentationEditorComponent() {
  const {
    resourceId,
    navigate,
    t,
    documentationType,
    setDocumentationType,
    markdownContent,
    setMarkdownContent,
    urlContent,
    setUrlContent,
    selectedTab,
    setSelectedTab,
    validationErrors,
    resource,
    isLoadingResource,
    isResourceError,
    resourceError,
    refetchResource,
    updateResource,
    handleSave,
    handleSubmit,
  } = useDocumentationEditorComponentState();

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
    <DocumentationEditorComponentDocumentationEditorPage
      {...{
        t,
        resource,
        resourceId,
        updateResource,
        handleSave,
        handleSubmit,
        documentationType,
        setDocumentationType,
        selectedTab,
        setSelectedTab,
        markdownContent,
        setMarkdownContent,
        validationErrors,
        urlContent,
        setUrlContent,
        navigate,
      }}
    />
  );
}

export const DocumentationEditor = memo(DocumentationEditorComponent);
