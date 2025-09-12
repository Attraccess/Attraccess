import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useResourcesServiceResourceUsageGetActiveSession } from '@attraccess/react-query-client';
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

  const isInUse = useMemo(() => {
    return !!session?.usage;
  }, [session]);

  return <Chip color={isInUse ? 'danger' : 'success'}>{isInUse ? t('status.inUse') : t('status.available')}</Chip>;
}
