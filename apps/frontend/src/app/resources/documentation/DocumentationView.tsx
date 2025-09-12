import { memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, CardBody, CardFooter, CardHeader, Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ArrowLeft, Edit, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import ReactMarkdown from 'react-markdown';
import en from './documentationModal.en.json';
import de from './documentationModal.de.json';
import { useAuth } from '../../../hooks/useAuth';

function DocumentationViewComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const { t } = useTranslations({
    en,
    de,
  });

  const {
    data: resource,
    isLoading: isLoadingResource,
    isError: isResourceError,
    error: resourceError,
    refetch: refetchResource,
    isFetching,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const handleEditDocumentation = useCallback(() => {
    navigate(`/resources/${resourceId}/documentation/edit`);
  }, [navigate, resourceId]);

  const canManageResources = hasPermission('canManageResources');

  // Handle loading state
  if (isLoadingResource) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner size="lg" label={t('loading')} data-cy="documentation-view-loading-spinner" />
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
          <Button
            onPress={() => refetchResource()}
            color="primary"
            startContent={<RefreshCw size={16} />}
            data-cy="documentation-view-error-retry-button"
          >
            {t('actions.retry')}
          </Button>
          <Button
            onPress={() => navigate('/resources')}
            variant="flat"
            startContent={<ArrowLeft size={16} />}
            data-cy="documentation-view-error-back-to-resources-button"
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
            data-cy="documentation-view-not-found-back-to-resources-button"
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
          <div className="flex gap-2">
            {canManageResources && (
              <Button
                color="primary"
                variant="flat"
                onPress={handleEditDocumentation}
                startContent={<Edit size={16} />}
                data-cy="documentation-view-header-edit-button"
              >
                {t('actions.edit')}
              </Button>
            )}
            <Button
              variant="flat"
              onPress={() => refetchResource()}
              isLoading={isFetching}
              startContent={<RefreshCw size={16} />}
              aria-label={t('actions.refresh')}
              data-cy="documentation-view-header-refresh-button"
            >
              {t('actions.refresh')}
            </Button>
          </div>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">{resource.name}</h2>
        </CardHeader>
        <CardBody className="relative">
          {isFetching && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <Spinner size="lg" data-cy="documentation-view-fetching-spinner" />
            </div>
          )}

          {!resource.documentationType && <p className="text-center text-default-400 p-4">{t('noDocumentation')}</p>}

          {resource.documentationType === 'markdown' && resource.documentationMarkdown && (
            <div className="prose max-w-none">
              <ReactMarkdown>{resource.documentationMarkdown}</ReactMarkdown>
            </div>
          )}

          {resource.documentationType === 'url' && resource.documentationUrl && (
            <iframe
              src={resource.documentationUrl}
              className="w-full h-[calc(100vh-300px)] min-h-[500px] border-0"
              title={`${resource.name} Documentation`}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export const DocumentationView = memo(DocumentationViewComponent);
