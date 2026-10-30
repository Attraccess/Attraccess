import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useResourceMaintenancesServiceFindMaintenances,
  useResourcesServiceResourceUsageGetActiveSession,
} from '@attraccess/react-query-client';
import { Chip } from '@heroui/react';
import { useMemo } from 'react';
import { isForbiddenError } from '../../../../api/isForbiddenError';

import en from './en.json';
import de from './de.json';

interface Props {
  resourceId: number;
}

export function StatusChip(props: Readonly<Props>) {
  const { resourceId } = props;

  const { t } = useTranslations({ de, en });

  const { data: session, error: sessionError } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
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

  // "Introduced only" mode: this viewer may not see activity here, so show no status rather than a wrong one.
  if (isForbiddenError(sessionError)) {
    return null;
  }

  // In-use takes priority over maintenance to mirror the resource details view.
  if (isInUse) {
    return <Chip color="danger">{t('status.inUse')}</Chip>;
  }

  if (isUnderMaintenance) {
    return <Chip color="warning">{t('status.maintenance')}</Chip>;
  }

  return <Chip color="success">{t('status.available')}</Chip>;
}
