import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import type { WagoDiagnostics } from './diagnostics';
import { useWagoDiagnostics } from './diagnostics';
import { useWagoTranslations } from '../i18n';
import { BOUNDED_MESSAGES_CAPABILITY } from '../../../shared/capabilities';

type DropCountsSource = Pick<WagoDiagnostics, 'dropCounts' | 'heartbeatFreshness' | 'capabilities'>;

// Counters come from the last heartbeat, so a stale one is not shown as the controller's current state.
const currentCounts = (d: DropCountsSource) => (d.heartbeatFreshness === 'fresh' ? d.dropCounts : null);

/** A `<dl>` row: what the controller dropped without answering, from its last heartbeat. */
export function DropCountsRow({ diagnostics: d }: { diagnostics: DropCountsSource }) {
  const { t } = useWagoTranslations();
  const counts = currentCounts(d);
  return (
    <div>
      <dt className="wg:text-sm wg:text-muted">{t('diagnostics.dropCountsLabel')}</dt>
      <dd>
        {counts
          ? t('diagnostics.dropCounts', { oversized: counts.oversized, overload: counts.overload })
          : t(
              d.capabilities.includes(BOUNDED_MESSAGES_CAPABILITY)
                ? 'diagnostics.dropCountsUnavailable'
                : 'diagnostics.dropCountsUnsupported',
            )}
      </dd>
    </div>
  );
}

/** Explains the consequence when the current counters show any dropped message. */
export function DropCountsWarning({ diagnostics: d }: { diagnostics: DropCountsSource }) {
  const { t } = useWagoTranslations();
  const counts = currentCounts(d);
  if (!counts || !Object.values(counts).some((count) => count > 0)) return null;
  return <StatusAlert status="warning">{t('diagnostics.dropExplanation')}</StatusAlert>;
}

/** The counters as a standalone fact list, for views that are not a `<dl>` themselves. */
export function DropCounts({ diagnostics }: { diagnostics: DropCountsSource }) {
  return (
    <>
      <dl>
        <DropCountsRow diagnostics={diagnostics} />
      </dl>
      <DropCountsWarning diagnostics={diagnostics} />
    </>
  );
}

function useCurrentDiagnostics(controllerId: number) {
  const query = useWagoDiagnostics(controllerId);
  return query.data && !query.isError ? query.data : null;
}

/** For the controller details fact list: renders nothing until diagnostics have loaded. */
export function ControllerDropCountsRow({ controllerId }: { controllerId: number }) {
  const diagnostics = useCurrentDiagnostics(controllerId);
  return diagnostics ? <DropCountsRow diagnostics={diagnostics} /> : null;
}

/** For the controller details, next to its other warnings. Shares the cached diagnostics query with the row. */
export function ControllerDropCountsWarning({ controllerId }: { controllerId: number }) {
  const diagnostics = useCurrentDiagnostics(controllerId);
  return diagnostics ? <DropCountsWarning diagnostics={diagnostics} /> : null;
}
