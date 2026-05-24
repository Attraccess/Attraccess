// Layout shell for resource detail pages with persistent tab navigation bar
// FEATURE: ATT-386 Resource details page full redesign tabbed hub layout
import { useParams, useNavigate, useLocation, Outlet, Navigate } from 'react-router-dom';
import { Button, Spinner, Tabs, TabList, Tab, useOverlayState } from '@heroui/react';
import { useAuth } from '../../../../hooks/useAuth';
import { useToastMessage } from '../../../../components/toastProvider';
import {
  ArrowLeft,
  FolderIcon,
  Gauge,
  History as HistoryIcon,
  ListChecks,
  PenSquareIcon,
  QrCodeIcon,
  ShapesIcon,
  Trash,
  Users,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { memo, ReactNode, useMemo, useRef } from 'react';
import type { JSX } from 'react';
import {
  useResourcesServiceDeleteOneResource,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { PageHeader, PageAction } from '../../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { ResourceEditModal } from '../../editModal/resourceEditModal';
import { ResourceQrCode } from '../qrcode';
import { useQrCodeAction } from '../useQrCodeAction';
import { filenameToUrl } from '../../../../api';
import { ResourceHealthWarning } from '../health-state';
import { Select } from '../../../../components/select';
import { useResourceTabs, ResourceTabKey } from './useResourceTabs';
import de from '../resourceDetails.de.json';
import en from '../resourceDetails.en.json';

const TAB_ICONS: Record<ResourceTabKey, JSX.Element> = {
  overview: <Gauge className="w-4 h-4" />,
  history: <HistoryIcon className="w-4 h-4" />,
  people: <Users className="w-4 h-4" />,
  groups: <FolderIcon className="w-4 h-4" />,
  maintenance: <WrenchIcon className="w-4 h-4" />,
  flows: <WorkflowIcon className="w-4 h-4" />,
  forms: <ListChecks className="w-4 h-4" />,
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
  const { isOpen, open, close: closeDeleteModal } = useOverlayState();

  const { hasPermission } = useAuth();
  const { success, error: showError } = useToastMessage();
  useQrCodeAction({ resourceId });

  const { t } = useTranslations({ en, de });

  const canManageResources = hasPermission('canManageResources');

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const deleteResource = useResourcesServiceDeleteOneResource();

  const editOpenRef = useRef<() => void>(() => undefined);
  const qrOpenRef = useRef<() => void>(() => undefined);

  const { tabs } = useResourceTabs(resourceId);

  const activeTabKey = useMemo<ResourceTabKey>(() => {
    const base = `/resources/${resourceId}`;
    const remainder = location.pathname.startsWith(base)
      ? location.pathname.slice(base.length).replace(/^\//, '').split('/')[0]
      : '';
    const match = tabs.find((tab) => tab.path === remainder);
    return match?.key ?? 'overview';
  }, [location.pathname, resourceId, tabs]);

  const handleDelete = async () => {
    try {
      await deleteResource.mutateAsync({ id: resourceId });
      success({
        title: 'Resource deleted',
        description: `${resource?.name} has been successfully deleted`,
      });
      queryClient.invalidateQueries({ queryKey: [useResourcesServiceGetAllResourcesKey] });
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
      isHidden: !canManageResources,
      onPress: () => qrOpenRef.current(),
      dataCy: 'qr-code-button',
    },
    {
      key: 'edit',
      label: t('actions.edit'),
      icon: <PenSquareIcon className="w-4 h-4" />,
      isHidden: !canManageResources,
      onPress: () => editOpenRef.current(),
      dataCy: 'edit-resource-button',
    },
    {
      key: 'delete',
      label: t('actions.delete'),
      icon: <Trash className="w-4 h-4" />,
      variant: 'destructive',
      isHidden: !canManageResources,
      onPress: open,
      dataCy: 'delete-resource-button',
    },
  ];

  const useMobilePicker = tabs.length > 5;

  const navigateToTab = (key: ResourceTabKey) => {
    const next = tabs.find((tab) => tab.key === key);
    if (next) navigate(`/resources/${resourceId}${next.path ? '/' + next.path : ''}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
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
      />

      <div className="mb-6">
        <ResourceHealthWarning resourceId={resourceId} />
      </div>

      <div className="mb-6">
        {useMobilePicker ? (
          <div className="sm:hidden">
            <Select
              aria-label={t('tabs.mobilePickerLabel')}
              value={activeTabKey}
              onChange={(key) => navigateToTab(key as ResourceTabKey)}
              items={tabs.map((tab) => ({ key: tab.key, label: t(tab.translationKey) }))}
              data-cy="resource-tabs-mobile-picker"
            />
          </div>
        ) : null}

        <div className={useMobilePicker ? 'hidden sm:block' : ''}>
          <Tabs
            aria-label={t('tabs.mobilePickerLabel')}
            selectedKey={activeTabKey}
            onSelectionChange={(key) => navigateToTab(key as ResourceTabKey)}
            data-cy="resource-tabs"
          >
            <TabList>
              {tabs.map((tab) => (
                <Tab key={tab.key} id={tab.key}>
                  <span className="flex items-center gap-2">
                    {TAB_ICONS[tab.key]}
                    {t(tab.translationKey)}
                  </span>
                </Tab>
              ))}
            </TabList>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">{children ?? <Outlet />}</div>

      {canManageResources && (
        <>
          <DeleteConfirmationModal
            isOpen={isOpen}
            onClose={closeDeleteModal}
            onConfirm={handleDelete}
            itemName={resource.name}
            data-cy="delete-confirmation-modal"
          />
          <ResourceEditModal resourceId={resourceId} closeOnSuccess>
            {(onOpen) => {
              editOpenRef.current = onOpen;
              return null;
            }}
          </ResourceEditModal>
          <ResourceQrCode
            resourceId={resourceId}
            renderTrigger={(onOpen) => {
              qrOpenRef.current = onOpen;
              return null;
            }}
          />
        </>
      )}

      {tabs.find((tab) => tab.key === activeTabKey) ? null : <Navigate to={`/resources/${resourceId}`} replace />}
    </div>
  );
}

export const ResourceTabsLayout = memo(ResourceTabsLayoutComponent);
