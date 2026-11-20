import { Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';

export function ReachabilityChip({ reachable }: Readonly<{ reachable: boolean | null }>) {
  const { t } = useMatterTranslations();
  const key = reachable === null ? 'unknown' : reachable ? 'reachable' : 'unreachable';
  return (
    <Chip
      color={reachable === null ? 'default' : reachable ? 'success' : 'danger'}
      variant="soft"
      data-cy={`matter-reachability-${key}`}
    >
      {t(`devices.reachability.${key}`)}
    </Chip>
  );
}
