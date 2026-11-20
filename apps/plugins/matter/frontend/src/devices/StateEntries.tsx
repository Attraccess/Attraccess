import { DateTimeDisplay, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Chip, Spinner } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { StateEntry } from './api';
import { formatStateValue, stateLabel } from './stateFormat';
import { useEndpointState } from './useEndpointState';

const FRESHNESS_COLOR = { fresh: 'success', stale: 'warning', unknown: 'default' } as const;

function Entry({ entry }: Readonly<{ entry: StateEntry }>) {
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

/** The current state of one endpoint with current/stale markers and observation times. Follows the `device-state` topic. */
export function StateEntries({ endpointRef, enabled }: Readonly<{ endpointRef: string; enabled: boolean }>) {
  const { t } = useMatterTranslations();
  const state = useEndpointState(endpointRef, enabled);
  if (state.loading) return <Spinner size="sm" />;
  if (state.error && !state.data) {
    return (
      <StatusAlert status="danger" title={t('devices.state.loadError')} data-cy="matter-state-error">
        {state.error}
      </StatusAlert>
    );
  }
  const states = state.data?.states ?? [];
  return (
    <div className="mt:flex mt:flex-col mt:gap-1" data-cy="matter-state-entries">
      {state.stale && (
        <p className="mt:text-sm mt:text-warning" data-cy="matter-state-stale">
          {t('devices.stale.title')}
        </p>
      )}
      {states.length === 0 ? (
        <p className="mt:text-sm mt:text-muted" data-cy="matter-state-none">
          {t('devices.state.none')}
        </p>
      ) : (
        <ul className="mt:flex mt:flex-col mt:gap-1">
          {states.map((entry) => (
            <Entry key={entry.stateKey} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
