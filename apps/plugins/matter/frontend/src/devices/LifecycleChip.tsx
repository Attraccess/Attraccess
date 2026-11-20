import { Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { LifecycleState } from './api';

const COLOR = {
  unclaimed: 'warning',
  claimed: 'success',
  detached: 'danger',
  archived: 'default',
  removed: 'default',
} as const;

/** Unclaimed and detached are coloured on purpose: they are the states that ask for a decision. */
export function LifecycleChip({ state }: Readonly<{ state: LifecycleState }>) {
  const { t } = useMatterTranslations();
  return (
    <Chip color={COLOR[state]} variant="soft" data-cy={`matter-lifecycle-${state}`}>
      {t(`devices.lifecycle.${state}`)}
    </Chip>
  );
}
