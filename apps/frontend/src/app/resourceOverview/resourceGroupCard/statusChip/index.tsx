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

  const {
    data: session,
    error: sessionError,
    isPending: isSessionPending,
  } = useResourcesServiceResourceUsageGetActiveSession({ resourceId });
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

  // Wait for the session read: showing "Available" first would be a guess, and in "introduced only" mode a
  // wrong one that disappears a moment later.
  if (isSessionPending) {
    return null;
  }

  // In "introduced only" activity visibility, the session read answers 403 to viewers who may not see activity
  // on this resource. That is an answer, not a failure: show no activity status rather than a wrong one.
  // Maintenance is not activity data, so it still shows.
  if (isForbiddenError(sessionError)) {
    return isUnderMaintenance ? <Chip color="warning">{t('status.maintenance')}</Chip> : null;
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
