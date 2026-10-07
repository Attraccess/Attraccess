import { useNavigate, useLocation } from 'react-router-dom';
import { useOverlayState } from '@heroui/react';
import { useAuth } from '../../../../hooks/useAuth';
import { useToastMessage } from '../../../../components/toastProvider';
import { ReactNode, useMemo, useRef } from 'react';
import {
  useResourcesServiceDeleteOneResource,
  useResourcesServiceGetOneResourceById,
  useResourcesServiceGetAllResourcesKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useQrCodeAction } from '../useQrCodeAction';
import { useResourceTabs, ResourceTabKey } from './useResourceTabs';
import de from '../resourceDetails.de.json';
import en from '../resourceDetails.en.json';

export function useResourceTabsLayoutInnerState({
  resourceId,
  children,
}: {
  resourceId: number;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isOpen, open, close: closeDeleteModal } = useOverlayState();

  const { hasPermission } = useAuth();
  const { success, error: showError } = useToastMessage();
  useQrCodeAction({ resourceId });

  const { t } = useTranslations({ en, de });

  const canUpdateResources = hasPermission('resources.update');

  const {
    data: resource,
    isLoading: isLoadingResource,
    error: resourceError,
  } = useResourcesServiceGetOneResourceById({ id: resourceId });

  const deleteResource = useResourcesServiceDeleteOneResource();

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
  return {
    navigate,
    isOpen,
    open,
    closeDeleteModal,
    t,
    canUpdateResources,
    resource,
    isLoadingResource,
    resourceError,
    qrOpenRef,
    tabs,
    activeTabKey,
    handleDelete,
    resourceId,
    children,
  } as const;
}
