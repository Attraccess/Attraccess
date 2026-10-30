import type { WagoDiagnostics } from './diagnostics';
import { useWagoDiagnostics } from './diagnostics';
import { useWagoTranslations } from '../i18n';
import { BOUNDED_MESSAGES_CAPABILITY } from '../../../shared/capabilities';

/** What the controller dropped without answering, from its last heartbeat. */
export function DropCounts({
  diagnostics: d,
}: {
  diagnostics: Pick<WagoDiagnostics, 'dropCounts' | 'heartbeatFreshness' | 'capabilities'>;
}) {
  const { t } = useWagoTranslations();
  // Counters come from the last heartbeat, so a stale one is not shown as the controller's current state.
  const counts = d.heartbeatFreshness === 'fresh' ? d.dropCounts : null;
  return (
    <>
      <p>
        {counts
          ? t('diagnostics.dropCounts', { oversized: counts.oversized, overload: counts.overload })
          : t(
              d.capabilities.includes(BOUNDED_MESSAGES_CAPABILITY)
                ? 'diagnostics.dropCountsUnavailable'
                : 'diagnostics.dropCountsUnsupported',
            )}
      </p>
      {counts && Object.values(counts).some((count) => count > 0) && (
        <p role="status">{t('diagnostics.dropExplanation')}</p>
      )}
    </>
  );
}

/** For views that show a controller without the full diagnostics, such as the controller details. */
export function ControllerDropCounts({ controllerId }: { controllerId: number }) {
  const query = useWagoDiagnostics(controllerId);
  if (!query.data || query.isError) return null;
  return (
    <div className="wg:text-sm wg:text-muted">
      <DropCounts diagnostics={query.data} />
    </div>
  );
}
