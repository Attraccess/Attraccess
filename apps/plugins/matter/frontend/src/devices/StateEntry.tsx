import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { Chip } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { StateEntry as StateEntryData } from './api';
import { formatStateValue, stateLabel } from './stateFormat';

const FRESHNESS_COLOR = { fresh: 'success', stale: 'warning', unknown: 'default' } as const;

/** One reported state value with its current/stale marker, observation time and fault. */
export function StateEntry({ entry }: Readonly<{ entry: StateEntryData }>) {
  const { t, tExists } = useMatterTranslations();
  return (
    <li className="mt:flex mt:flex-wrap mt:items-center mt:gap-x-3 mt:gap-y-1 mt:text-sm" data-cy="matter-state-entry">
      <span className="mt:font-medium">{stateLabel(t, tExists, entry.stateKey)}</span>
      <span data-cy="matter-state-value">{formatStateValue(t, tExists, entry.stateKey, entry.reported.value)}</span>
      <Chip
        size="sm"
        variant="soft"
        color={FRESHNESS_COLOR[entry.freshness]}
        data-cy={`matter-state-${entry.freshness}`}
      >
        {t(`devices.state.freshness.${entry.freshness}`)}
      </Chip>
      {entry.uncertainActuation && (
        <Chip size="sm" variant="soft" color="warning" data-cy="matter-state-uncertain">
          {t('devices.state.uncertain')}
        </Chip>
      )}
      {entry.reported.observedAt && (
        <span className="mt:text-muted">
          {t('devices.state.observed')}: <DateTimeDisplay date={entry.reported.observedAt} />
        </span>
      )}
      {entry.fault && (
        <span className="mt:text-danger">{t('devices.state.fault', { message: entry.fault.message })}</span>
      )}
    </li>
  );
}
