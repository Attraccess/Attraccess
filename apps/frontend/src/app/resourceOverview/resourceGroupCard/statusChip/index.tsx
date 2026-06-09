import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourceMaintenancesServiceFindMaintenances,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { Chip } from '@heroui/react';
import { useMemo } from 'react';

import en from './en.json';
import de from './de.json';

interface Props {
  resourceId: number;
}

export function StatusChip(props: Readonly<Props>) {
  const { resourceId } = props;

  const { t } = useTranslations({ de, en });

  const { data: session } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
  const { data: activeMaintenances } = useResourceMaintenancesServiceFindMaintenances({
    resourceId,
    includeActive: true,
  });

  const isInUse = useMemo(() => {
    return !!session?.usage;
  }, [session]);

  const isUnderMaintenance = useMemo(() => {
    return (activeMaintenances?.data?.length ?? 0) > 0;
  }, [activeMaintenances]);

  // In-use takes priority over maintenance to mirror the resource details view.
  if (isInUse) {
    return <Chip color="danger">{t('status.inUse')}</Chip>;
  }

  if (isUnderMaintenance) {
    return <Chip color="warning">{t('status.maintenance')}</Chip>;
  }

  return <Chip color="success">{t('status.available')}</Chip>;
}
