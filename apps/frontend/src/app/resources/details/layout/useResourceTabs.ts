import { useMemo } from 'react';
import {
  useAccessControlServiceResourceIntroducersIsIntroducer,
  useResourceMaintenancesServiceCanManageMaintenance,
} from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

export type ResourceTabKey =
  | 'overview'
  | 'history'
  | 'people'
  | 'groups'
  | 'maintenance'
  | 'flows'
  | 'forms';

export interface ResourceTabDescriptor {
  key: ResourceTabKey;
  path: string;
  translationKey: string;
}

export function useResourceTabs(resourceId: number): {
  tabs: ResourceTabDescriptor[];
  canUpdateResources: boolean;
  isIntroducer: boolean;
  canManageMaintenance: boolean;
} {
  const { hasPermission, user } = useAuth();
  const canUpdateResources = hasPermission('resources.update');

  const { data: introducerData } = useAccessControlServiceResourceIntroducersIsIntroducer(
    {
      resourceId,
      userId: user?.id as number,
      includeGroups: true,
    },
    undefined,
    { enabled: !!user?.id },
  );
  const isIntroducer = !!introducerData?.isIntroducer;

  const { data: maintenancePermissions } =
    useResourceMaintenancesServiceCanManageMaintenance({ resourceId });
  const canManageMaintenance = !!maintenancePermissions?.canManage;

  const tabs = useMemo<ResourceTabDescriptor[]>(() => {
    const list: ResourceTabDescriptor[] = [
      { key: 'overview', path: '', translationKey: 'tabs.overview' },
      { key: 'history', path: 'history', translationKey: 'tabs.history' },
    ];

    if (isIntroducer || canUpdateResources) {
      list.push({ key: 'people', path: 'people', translationKey: 'tabs.people' });
    }
    if (canUpdateResources) {
      list.push({ key: 'groups', path: 'groups', translationKey: 'tabs.groups' });
    }
    if (canManageMaintenance) {
      list.push({ key: 'maintenance', path: 'maintenance', translationKey: 'tabs.maintenance' });
    }
    if (canUpdateResources) {
      list.push({ key: 'flows', path: 'flows', translationKey: 'tabs.flows' });
      list.push({ key: 'forms', path: 'forms', translationKey: 'tabs.forms' });
    }
    return list;
  }, [isIntroducer, canUpdateResources, canManageMaintenance]);

  return { tabs, canUpdateResources, isIntroducer, canManageMaintenance };
}
