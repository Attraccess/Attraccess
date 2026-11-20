// Layout shell for resource detail pages with persistent tab navigation bar
// FEATURE: ATT-386 Resource details page full redesign tabbed hub layout

import { useParams, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Button, Spinner } from '@heroui/react';
import {
  ArrowLeft,
  Settings2Icon,
  QrCodeIcon,
  ShapesIcon,
  Trash,
  Gauge,
  History as HistoryIcon,
  Users,
  WrenchIcon,
} from 'lucide-react';
import { memo, ReactNode, JSX, useRef } from 'react';
import { ResourceQrCode } from '../qrcode/index';
import { filenameToUrl } from '../../../../api/index';
import { ResourceHealthWarning } from '../health-state/index';
import { ResourceTabKey, useResourceTabs } from './useResourceTabs';
import { useAuth } from '../../../../hooks/useAuth';
import { useToastMessage } from '../../../../components/toastProvider';
import { useDeleteOneResource, useGetOneResourceById, useGetAllResourcesKey } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  PageAction,
  PageHeader,
  RoutedTabs,
  activeRoutedTab,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import { useQrCodeAction } from '../useQrCodeAction';
import de from '../resourceDetails.de.json';
import en from '../resourceDetails.en.json';
import { DashboardPinTargetContext, resourcePinTarget } from '../../../dashboard/pinTarget';

export const TAB_ICONS: Record<ResourceTabKey, JSX.Element> = {
  overview: <Gauge className="w-4 h-4" />,
  history: <HistoryIcon className="w-4 h-4" />,
  people: <Users className="w-4 h-4" />,
  maintenance: <WrenchIcon className="w-4 h-4" />,
};

function ResourceTabsLayoutComponent({ children }: { children?: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);

  if (!Number.isFinite(resourceId)) {
    return <Navigate to="/resources" replace />;
  }

  return <ResourceTabsLayoutInner resourceId={resourceId}>{children}</ResourceTabsLayoutInner>;
}

function ResourceTabsLayoutInner({ resourceId, children }: { resourceId: number; children?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { hasPermission } = useAuth();
  const { success, error: showError } = useToastMessage();
  const { confirmationDialog } = useQrCodeAction({ resourceId });

  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t } = useTranslations({ en, de }, { escapeValues: false });

  const canUpdateResources = hasPermission('resources.update');
  const canDeleteResources = hasPermission('resources.delete');

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useGetOneResourceById({ path: { id: resourceId } });

  const deleteResource = useDeleteOneResource();

  const qrOpenRef = useRef<() => void>(() => undefined);

  const { tabs } = useResourceTabs(resourceId);

  const activeTabKey = activeRoutedTab(tabs, `/resources/${resourceId}`, location.pathname)?.key ?? 'overview';

  const handleDelete = async () => {
    if (!canDeleteResources) return;
    try {
      await deleteResource.mutateAsync({ path: { id: resourceId } });
      success({
        title: 'Resource deleted',
        description: `${resource?.name} has been successfully deleted`,
      });
      queryClient.invalidateQueries({ queryKey: [useGetAllResourcesKey] });
      navigate('/resources');
    } catch (err) {
      showError({
        title: 'Failed to delete resource',
        description: 'An error occurred while deleting the resource. Please try again.',
      });
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
        <Button variant="ghost" onPress={() => navigate('/resources')} data-cy="back-to-resources-button">
          <ArrowLeft className="w-4 h-4" />
          {t('error.resourceNotFound.backToResources')}
        </Button>
      </div>
    );
  }

  const overflowActions: PageAction[] = [
    {
      key: 'qr',
      label: t('actions.qrCode'),
      icon: <QrCodeIcon className="w-4 h-4" />,
      isHidden: !canUpdateResources,
      onPress: () => qrOpenRef.current(),
      dataCy: 'qr-code-button',
    },
    {
      key: 'edit',
      label: t('actions.edit'),
      icon: <Settings2Icon className="w-4 h-4" />,
      isHidden: !canUpdateResources,
      onPress: () => navigate(`/resources/${resourceId}/settings`),
      dataCy: 'edit-resource-button',
    },
    {
      key: 'delete',
      label: t('actions.delete'),
      icon: <Trash className="w-4 h-4" />,
      variant: 'destructive',
      isHidden: !canDeleteResources,
      onPress: handleDelete,
      confirm: {
        title: t('actions.deleteConfirm.title', { name: resource.name }),
        message: t('actions.deleteConfirm.message'),
        'data-cy': 'delete-confirmation-modal',
        confirmDataCy: 'delete-button',
        cancelDataCy: 'cancel-button',
      },
      dataCy: 'delete-resource-button',
    },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <DashboardPinTargetContext.Provider value={resourcePinTarget(resourceId)}>
        <PageHeader
          title={resource.name}
          icon={!resource.imageFilename && <ShapesIcon className="w-6 h-6" />}
          thumbnailSrc={resource.imageFilename ? filenameToUrl(resource.imageFilename) : undefined}
          thumbnailAlt={resource.name}
          subtitle={resource.description ?? undefined}
          backTo="/resources"
          actions={overflowActions}
          maxVisibleActions={0}
          moreActionsLabel={t('actions.moreLabel')}
          noMargin
        />
      </DashboardPinTargetContext.Provider>

      <ResourceHealthWarning resourceId={resourceId} />

      <RoutedTabs
        className="mt-4 mb-4"
        items={tabs.map((tab) => ({
          key: tab.key,
          label: t(tab.translationKey),
          icon: TAB_ICONS[tab.key],
          path: tab.path,
        }))}
        basePath={`/resources/${resourceId}`}
        fallbackKey="overview"
        aria-label={t('tabs.mobilePickerLabel')}
        data-cy="resource-tabs"
      />

      <div className="flex-1 min-h-0 overflow-auto">{children ?? <Outlet />}</div>
      {confirmationDialog}

      {canUpdateResources && (
        <ResourceQrCode
          resourceId={resourceId}
          renderTrigger={(onOpen) => {
            qrOpenRef.current = onOpen;
            return null;
          }}
        />
      )}

      {tabs.find((tab) => tab.key === activeTabKey) ? null : <Navigate to={`/resources/${resourceId}`} replace />}
    </div>
  );
}

export const ResourceTabsLayout = memo(ResourceTabsLayoutComponent);
