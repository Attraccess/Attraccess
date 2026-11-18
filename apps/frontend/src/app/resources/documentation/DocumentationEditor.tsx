import { memo, useEffect, useState } from 'react';
import { Spinner } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { useGetOneResourceById } from '@attraccess/react-query-client';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, PageHeader, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './documentationEditor.en.json';
import de from './documentationEditor.de.json';
import { DocumentationEditorForm } from './DocumentationEditorForm';
import { DocumentationDraft, documentationContentOf, documentationDraftOf } from './documentationDraft';

function DocumentationEditorComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  const navigate = useNavigate();
  const { t } = useTranslations({ en, de });
  const {
    data: resource,
    isLoading: isLoadingResource,
    isError: isResourceError,
    error: resourceError,
    refetch: refetchResource,
  } = useGetOneResourceById({ path: { id: resourceId } });
  // The draft lives here, above the loading and error views, so a failed background refetch (error
  // view) and the Retry after it (loading) do not throw away what the operator typed. It follows the
  // server only when the resource itself changes.
  const [draft, setDraft] = useState<DocumentationDraft>(() => documentationDraftOf(resource));
  useEffect(() => {
    if (resource) {
      setDraft((current) => ({ ...current, ...documentationContentOf(resource) }));
    }
  }, [resource]);

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

  return <DocumentationEditorForm resource={resource} resourceId={resourceId} draft={draft} onDraftChange={setDraft} />;
}

export const DocumentationEditor = memo(DocumentationEditorComponent);
