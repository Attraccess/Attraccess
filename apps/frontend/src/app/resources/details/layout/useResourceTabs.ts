import { useMemo } from 'react';
import { useResourceIntroducersIsIntroducer, useCanManageMaintenance } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

export type ResourceTabKey = 'overview' | 'history' | 'people' | 'maintenance';

export interface ResourceTabDescriptor {
  key: ResourceTabKey;
  path: string;
  translationKey: string;
}

export function useResourceTabs(resourceId: number): {
  tabs: ResourceTabDescriptor[];
  canUpdateResources: boolean;
  canManageAccess: boolean;
  isIntroducer: boolean;
  canManageMaintenance: boolean;
} {
  const { hasPermission, user } = useAuth();
  const canUpdateResources = hasPermission('resources.update');
  const canManageAccess = hasPermission('resources.access.manage');

  const { data: introducerData } = useResourceIntroducersIsIntroducer(
    { path: { resourceId, userId: user?.id as number }, query: { includeGroups: true } },
    undefined,
    { enabled: !!user?.id },
  );
  const isIntroducer = !!introducerData?.isIntroducer;

  const { data: maintenancePermissions } = useCanManageMaintenance({ path: { resourceId } });
  const canManageMaintenance = !!maintenancePermissions?.canManage;

  const tabs = useMemo<ResourceTabDescriptor[]>(() => {
    const list: ResourceTabDescriptor[] = [
      { key: 'overview', path: '', translationKey: 'tabs.overview' },
      { key: 'history', path: 'history', translationKey: 'tabs.history' },
    ];

    if (isIntroducer || canManageAccess || canUpdateResources) {
      list.push({ key: 'people', path: 'people', translationKey: 'tabs.people' });
    }
    if (canManageMaintenance) {
      list.push({ key: 'maintenance', path: 'maintenance', translationKey: 'tabs.maintenance' });
    }
    return list;
  }, [isIntroducer, canManageAccess, canUpdateResources, canManageMaintenance]);

  return { tabs, canUpdateResources, canManageAccess, isIntroducer, canManageMaintenance };
}
