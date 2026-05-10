import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spinner, useOverlayState } from '@heroui/react';
import { useAuth } from '../../../hooks/useAuth';
import { useToastMessage } from '../../../components/toastProvider';
import { ArrowLeft, BookOpen, ListChecks, PenSquareIcon, ShapesIcon, Trash, WorkflowIcon } from 'lucide-react';

import { ResourceUsageSession } from '../usage/resourceUsageSession';
import { ResourceUsageHistory } from '../usage/resourceUsageHistory';
import { PageHeader } from '../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../components/deleteConfirmationModal';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { memo, useState } from 'react';
import {
  useResourcesServiceDeleteOneResource,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceGetAllResourcesKey,
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourceMaintenancesServiceCanManageMaintenance,
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
import { MaintenanceManagement } from './maintenance-management';
import { MaintenanceSchedules } from './maintenance-schedules';
import { ResourceBillingInfo } from './resourceBillingInfo';
import { ResourceHealthWarning } from './health-state';

function ResourceDetailsComponent() {
  const { id } = useParams<{ id: string }>();
  const resourceId = parseInt(id || '', 10);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { isOpen, open, close: closeDeleteModal } = useOverlayState();

  const { hasPermission, user } = useAuth();
  const { success, error: showError } = useToastMessage();
  useQrCodeAction({ resourceId });

  const { t } = useTranslations({
    en,
    de,
  });

  const canManageResources = hasPermission('canManageResources');

  const { data: isIntroducer } = useAccessControlServiceResourceIntroducersIsIntroducer(
    {
      resourceId,
      userId: user?.id as number,
      includeGroups: true,
    },
    undefined,
    { enabled: !!user?.id },
  );

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const deleteResource = useResourcesServiceDeleteOneResource();

  const { data: maintenancePermissions } = useResourceMaintenancesServiceCanManageMaintenance({ resourceId });

  const [insufficientBalanceDesiredAmount, setInsufficientBalanceDesiredAmount] = useState(10);

  const handleDelete = async () => {
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      success({
        title: 'Resource deleted',
        description: `${resource?.name} has been successfully deleted`,
      });
      queryClient.invalidateQueries({
        queryKey: [useResourcesServiceGetAllResourcesKey],
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
        <Spinner color="accent" data-cy="resource-details-loading-spinner" />
      </div>
    );
  }

  if (resourceError || !resource) {
    return (
      <div className="max-w-7xl mx-auto px-4 flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-xl font-semibold mb-2">{t('error.resourceNotFound.title')}</h2>
        <p className="text-gray-500 mb-4">{t('error.resourceNotFound.description')}</p>
        <Button variant="ghost"
          onPress={() => navigate('/resources')}
          data-cy="back-to-resources-button"
        ><ArrowLeft className="w-4 h-4" />
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
                <Button variant="ghost"
                  onPress={onOpenDocumentation}
                  data-cy="documentation-button"
                ><BookOpen className="w-4 h-4" />
                  {t('actions.documentation')}
                </Button>
              )}
            </DocumentationModal>

            {canManageResources && (
              <>
                <ResourceQrCode resourceId={resourceId} variant="ghost" buttonIconSize={16} />

                <Button variant="ghost"
                  onPress={() => navigate(`/resources/${resourceId}/flows`)}
                  data-cy="flows-button"
                ><WorkflowIcon className="w-4 h-4" />
                  {t('navItems.flows')}
                </Button>

                <Button variant="ghost"
                  onPress={() => navigate(`/resources/${resourceId}/forms`)}
                  data-cy="forms-button"
                ><ListChecks className="w-4 h-4" />
                  {t('navItems.forms')}
                </Button>

                <ResourceEditModal resourceId={resourceId} closeOnSuccess>
                  {(onOpen) => (
                    <Button variant="ghost"
                      onPress={onOpen}
                      data-cy="edit-resource-button"
                    ><PenSquareIcon className="w-4 h-4" />
                      {t('actions.edit')}
                    </Button>
                  )}
                </ResourceEditModal>

                <Button variant="danger-soft"
                  onPress={open}
                  data-cy="delete-resource-button"
                ><Trash className="w-4 h-4" />
                  {t('actions.delete')}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="w-full space-y-6 mb-6">
        <ResourceHealthWarning resourceId={resourceId} />
        <div className="flex flex-row flex-wrap w-full gap-6 items-stretch">
          <ResourceUsageSession
            resourceId={resourceId}
            resource={resource}
            data-cy="resource-usage-session"
            className="flex-grow"
            insufficientBalanceDesiredAmount={insufficientBalanceDesiredAmount}
          />
          <ResourceBillingInfo
            resourceId={resourceId}
            className="flex-grow"
            onExampleAmountChange={(value) => setInsufficientBalanceDesiredAmount(Math.ceil(value))}
          />
        </div>

        <div className="flex flex-row flex-wrap w-full gap-6 items-stretch">
          <ResourceUsageHistory resourceId={resourceId} data-cy="resource-usage-history" className="flex-grow" />

          {maintenancePermissions?.canManage && (
            <>
              <MaintenanceManagement resourceId={resourceId} className="flex-grow" />
              <MaintenanceSchedules resourceId={resourceId} className="flex-grow" />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-row flex-wrap w-full gap-6 items-stretch">
        {(isIntroducer?.isIntroducer || canManageResources) && (
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
          onClose={closeDeleteModal}
          onConfirm={handleDelete}
          itemName={resource.name}
          data-cy="delete-confirmation-modal"
        />
      )}
    </div>
  );
}

export const ResourceDetails = memo(ResourceDetailsComponent);
