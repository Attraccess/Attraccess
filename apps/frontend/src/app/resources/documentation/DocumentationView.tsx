import { memo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Spinner } from '@heroui/react';
import { Button } from '../../../components/button';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ArrowLeft, Edit, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/pageHeader';
import { useResourcesServiceGetOneResourceById } from '@attraccess/react-query-client';
import en from './documentationModal.en.json';
import de from './documentationModal.de.json';
import { useAuth } from '../../../hooks/useAuth';
import { Markdown } from '../../../components/markdown';

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

  const canManageResources = hasPermission('resources.update');

  // Handle loading state
  if (isLoadingResource) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner data-cy="documentation-view-loading-spinner" />
      </div>
    );
  }

  // Handle error state
  if (isResourceError) {
    return (
      <Card className="max-w-xl mx-auto my-8">
        <Card.Header>
          <h2 className="text-xl">{t('error.title')}</h2>
        </Card.Header>
        <Card.Content>
          <p className="text-danger">{resourceError instanceof Error ? resourceError.message : t('error.unknown')}</p>
        </Card.Content>
        <Card.Footer className="flex justify-center gap-4">
          <Button variant="primary"
            onPress={() => refetchResource()}
            data-cy="documentation-view-error-retry-button"
          ><RefreshCw size={16} />
            {t('actions.retry')}
          </Button>
          <Button variant="secondary"
            onPress={() => navigate('/resources')}
            data-cy="documentation-view-error-back-to-resources-button"
          ><ArrowLeft size={16} />
            {t('actions.backToResources')}
          </Button>
        </Card.Footer>
      </Card>
    );
  }

  // Handle not found state
  if (!resource) {
    return (
      <Card className="max-w-xl mx-auto my-8">
        <Card.Header>
          <h2 className="text-xl">{t('notFound.title')}</h2>
        </Card.Header>
        <Card.Content>
          <p>{t('notFound.message')}</p>
        </Card.Content>
        <Card.Footer className="justify-center">
          <Button variant="secondary"
            onPress={() => navigate('/resources')}
            data-cy="documentation-view-not-found-back-to-resources-button"
          ><ArrowLeft size={16} />
            {t('actions.backToResources')}
          </Button>
        </Card.Footer>
      </Card>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <PageHeader
        title={t('title')}
        subtitle={resource.name}
        backTo={`/resources/${resourceId}`}
        actions={[
          {
            key: 'edit',
            label: t('actions.edit'),
            icon: <Edit size={16} />,
            isHidden: !canManageResources,
            onPress: handleEditDocumentation,
            dataCy: 'documentation-view-header-edit-button',
          },
          {
            key: 'refresh',
            label: t('actions.refresh'),
            icon: <RefreshCw size={16} />,
            isPending: isFetching,
            onPress: () => refetchResource(),
            dataCy: 'documentation-view-header-refresh-button',
          },
        ]}
      />

      <Card className="mt-6">
        <Card.Header>
          <h2 className="text-xl font-semibold">{resource.name}</h2>
        </Card.Header>
        <Card.Content className="relative">
          {isFetching && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <Spinner data-cy="documentation-view-fetching-spinner" />
            </div>
          )}

          {!resource.documentationType && <p className="text-center text-default-400 p-4">{t('noDocumentation')}</p>}

          {resource.documentationType === 'markdown' && resource.documentationMarkdown && (
            <Markdown>{resource.documentationMarkdown}</Markdown>
          )}

          {resource.documentationType === 'url' && resource.documentationUrl && (
            <iframe
              src={resource.documentationUrl}
              className="w-full h-[calc(100vh-300px)] min-h-[500px] border-0"
              title={`${resource.name} Documentation`}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export const DocumentationView = memo(DocumentationViewComponent);
