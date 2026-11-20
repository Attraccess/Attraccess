import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Chip, Spinner } from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import { isRawStateKey } from './stateFormat';
import { StateEntry } from './StateEntry';
import { useEndpointState } from './useEndpointState';

/**
 * The current state of one endpoint with current/stale markers and observation times. Follows the `device-state` topic;
 * while that topic is unavailable a small "not live" chip says so (the page-level alert explains it). Entries for
 * attributes without a name (raw attribute IDs) are left out of this normal view.
 */
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
  const states = (state.data?.states ?? []).filter((entry) => !isRawStateKey(entry.stateKey));
  return (
    <div className="mt:flex mt:flex-col mt:gap-1" data-cy="matter-state-entries">
      {state.stale && (
        <div>
          <Chip size="sm" variant="soft" color="warning" data-cy="matter-state-live-stale">
            {t('devices.state.notLive')}
          </Chip>
        </div>
      )}
      {states.length === 0 ? (
        <p className="mt:text-sm mt:text-muted" data-cy="matter-state-none">
          {t('devices.state.none')}
        </p>
      ) : (
        <ul className="mt:flex mt:flex-col mt:gap-1">
          {states.map((entry) => (
            <StateEntry key={entry.stateKey} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
