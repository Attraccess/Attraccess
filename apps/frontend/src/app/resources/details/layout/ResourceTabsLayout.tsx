// Layout shell for resource detail pages with persistent tab navigation bar
// FEATURE: ATT-386 Resource details page full redesign tabbed hub layout
import { useParams, Outlet, Navigate } from 'react-router-dom';
import { Button, Spinner, Tabs, TabList, Tab } from '@heroui/react';
import { ArrowLeft, Settings2Icon, QrCodeIcon, ShapesIcon, Trash } from 'lucide-react';
import { memo, ReactNode } from 'react';
import { PageHeader, PageAction } from '../../../../components/pageHeader';
import { DeleteConfirmationModal } from '../../../../components/deleteConfirmationModal';
import { ResourceQrCode } from '../qrcode';
import { filenameToUrl } from '../../../../api';
import { ResourceHealthWarning } from '../health-state';
import { Select } from '../../../../components/select';
import { ResourceTabKey } from './useResourceTabs';
import { TAB_ICONS } from './ResourceTabsLayout.tab-icons';
import { useResourceTabsLayoutInnerState } from './useResourceTabsLayoutInnerState';

function ResourceTabsLayoutComponent({ children }: { children?: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const resourceId = Number.parseInt(id ?? '', 10);

  if (!Number.isFinite(resourceId)) {
    return <Navigate to="/resources" replace />;
  }

  return <ResourceTabsLayoutInner resourceId={resourceId}>{children}</ResourceTabsLayoutInner>;
}

function ResourceTabsLayoutInner({ resourceId, children }: { resourceId: number; children?: ReactNode }) {
  const {
    navigate,
    isOpen,
    open,
    closeDeleteModal,
    t,
    canUpdateResources,
    canDeleteResources,
    resource,
    isLoadingResource,
    resourceError,
    qrOpenRef,
    tabs,
    activeTabKey,
    handleDelete,
  } = useResourceTabsLayoutInnerState({ resourceId, children });

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
      onPress: open,
      dataCy: 'delete-resource-button',
    },
  ];

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
        noMargin
      />

      <ResourceHealthWarning resourceId={resourceId} />

      <div className="mt-4 mb-4">
        <div className="sm:hidden">
          <Select
            aria-label={t('tabs.mobilePickerLabel')}
            value={activeTabKey}
            onChange={(key) => navigateToTab(key as ResourceTabKey)}
            items={tabs.map((tab) => ({ key: tab.key, label: t(tab.translationKey) }))}
            data-cy="resource-tabs-mobile-picker"
          />
        </div>

        <div className="hidden sm:block">
          <Tabs
            aria-label={t('tabs.mobilePickerLabel')}
            selectedKey={activeTabKey}
            onSelectionChange={(key) => navigateToTab(key as ResourceTabKey)}
            data-cy="resource-tabs"
          >
            <Tabs.ListContainer>
              <TabList>
                {tabs.map((tab) => (
                  <Tab key={tab.key} id={tab.key}>
                    <Tabs.Indicator />
                    <span className="flex items-center gap-2">
                      {TAB_ICONS[tab.key]}
                      {t(tab.translationKey)}
                    </span>
                  </Tab>
                ))}
              </TabList>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">{children ?? <Outlet />}</div>

      {canDeleteResources && (
        <DeleteConfirmationModal
          isOpen={isOpen}
          onClose={closeDeleteModal}
          onConfirm={handleDelete}
          itemName={resource.name}
          data-cy="delete-confirmation-modal"
        />
      )}
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
