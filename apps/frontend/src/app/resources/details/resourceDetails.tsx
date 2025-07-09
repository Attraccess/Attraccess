import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useToastMessage } from '../../../components/toastProvider';
import { ArrowLeft, BookOpen, PenSquareIcon, ShapesIcon, Trash, WorkflowIcon } from 'lucide-react';
import { Button } from '@heroui/button';
import { Spinner, Link } from '@heroui/react';
import { useDisclosure } from '@heroui/modal';
import { ResourceUsageSession } from '../usage/resourceUsageSession';
import { ResourceUsageHistory } from '../usage/resourceUsageHistory';
import { PageHeader } from '../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { memo, useMemo } from 'react';
import {
  useResourcesServiceDeleteOneResource,
  useResourcesServiceGetOneResourceById,
  UseResourcesServiceGetAllResourcesKeyFn,
  useAccessControlServiceResourceIntroducersIsIntroducer,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { ManageResourceGroups } from '../groups';
import { DocumentationModal } from '../documentation';
import de from './resourceDetails.de.json';
import en from './resourceDetails.en.json';
import { ResourceEditModal } from '../editModal/resourceEditModal';
import { ResoureIntroducerManagement } from '../IntroducerManagement';
import { ResourceIntroductionsManagement } from '../IntroductionsManagement';
import { ResourceQrCode } from './qrcode';
import { useQrCodeAction } from './useQrCodeAction';
import { filenameToUrl } from '../../../api';

function ResourceDetailsComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const { hasPermission, user } = useAuth();
  const { success, error: showError } = useToastMessage();
  useQrCodeAction({ resourceId });

  const { t } = useTranslations('resourceDetails', {
    en,
    de,
  });

  const { data: isIntroducer } = useAccessControlServiceResourceIntroducersIsIntroducer(
    { resourceId, userId: user?.id as number },
    undefined,
    {
      enabled: !!user?.id,
      refetchInterval: 3000,
    }
  );

  const canManageResources = hasPermission('canManageResources');

  const canManageIntroductions = useMemo(
    () => canManageResources || isIntroducer?.isIntroducer,
    [canManageResources, isIntroducer]
  );

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const deleteResource = useResourcesServiceDeleteOneResource();

  const handleDelete = async () => {
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      success({
        title: 'Resource deleted',
        description: `${resource?.name} has been successfully deleted`,
      });
      queryClient.invalidateQueries({
        queryKey: [UseResourcesServiceGetAllResourcesKeyFn()[0]],
      });
      navigate('/resources');
    } catch (err) {
      showError({
        title: 'Failed to delete resource',
        description: 'An error occurred while deleting the resource. Please try again.',
      });
      console.error('Failed to delete resource:', err);
      throw err;
    }
  };

  if (isLoadingResource) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" color="primary" data-cy="resource-details-loading-spinner" />
      </div>
    );
  }

  if (resourceError || !resource) {
    return (
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-xl font-semibold mb-2">{t('error.resourceNotFound.title')}</h2>
        <p className="text-gray-500 mb-4">{t('error.resourceNotFound.description')}</p>
        <Button
          onPress={() => navigate('/resources')}
          variant="light"
          startContent={<ArrowLeft className="w-4 h-4" />}
          data-cy="back-to-resources-button"
        >
          {t('error.resourceNotFound.backToResources')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={resource.name}
        icon={!resource.imageFilename && <ShapesIcon className="w-6 h-6" />}
        thumbnailSrc={resource.imageFilename ? filenameToUrl(resource.imageFilename) : undefined}
        thumbnailAlt={resource.name}
        subtitle={resource.description ?? undefined}
        backTo="/resources"
        actions={
          <>
            <DocumentationModal resourceId={resourceId}>
              {(onOpenDocumentation) => (
                <Button
                  variant="light"
                  startContent={<BookOpen className="w-4 h-4" />}
                  onPress={onOpenDocumentation}
                  data-cy="documentation-button"
                >
                  {t('actions.documentation')}
                </Button>
              )}
            </DocumentationModal>

            {canManageResources && (
              <>
                <ResourceQrCode resourceId={resourceId} variant="light" buttonIconSize={16} />

                <Button
                  as={Link}
                  href={`/resources/${resourceId}/flows`}
                  variant="light"
                  startContent={<WorkflowIcon className="w-4 h-4" />}
                  data-cy="flows-button"
                >
                  {t('navItems.flows')}
                </Button>

                <ResourceEditModal resourceId={resourceId} closeOnSuccess>
                  {(onOpen) => (
                    <Button
                      onPress={onOpen}
                      variant="light"
                      startContent={<PenSquareIcon className="w-4 h-4" />}
                      data-cy="edit-resource-button"
                    >
                      {t('actions.edit')}
                    </Button>
                  )}
                </ResourceEditModal>

                <Button
                  onPress={onOpen}
                  color="danger"
                  variant="light"
                  startContent={<Trash className="w-4 h-4" />}
                  data-cy="delete-resource-button"
                >
                  {t('actions.delete')}
                </Button>
              </>
            )}
          </>
        }
      />

      {/* Full width Usage section for all devices */}
      <div className="w-full space-y-6 mb-6">
        <ResourceUsageSession
          resourceId={resourceId}
          resource={resource}
          data-cy="resource-usage-session"
          className="flex-1 min-w-80"
        />

        <ResourceUsageHistory resourceId={resourceId} data-cy="resource-usage-history" />
      </div>

      {/* Add the ManageResourceGroups component */}

      <div className="flex flex-row flex-wrap w-full gap-6 items-stretch">
        {canManageIntroductions && (
          <ResourceIntroductionsManagement
            resourceId={resourceId}
            className="flex-1 min-w-80"
            data-cy="manage-resource-introductions"
          />
        )}

        {canManageResources && (
          <>
            <ResoureIntroducerManagement
              resourceId={resourceId}
              className="flex-1 min-w-80"
              data-cy="manage-resource-introducers"
            />

            <ManageResourceGroups
              resourceId={resourceId}
              data-cy="manage-resource-groups"
              className="flex-1 min-w-80"
            />
          </>
        )}
      </div>

      {canManageResources && (
        <DeleteConfirmationModal
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onClose={() => onOpenChange()}
          onConfirm={handleDelete}
          itemName={resource.name}
          data-cy="delete-confirmation-modal"
        />
      )}
    </div>
  );
}

export const ResourceDetails = memo(ResourceDetailsComponent);
