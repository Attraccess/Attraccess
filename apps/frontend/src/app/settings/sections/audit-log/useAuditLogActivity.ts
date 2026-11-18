import { ApiError, useAuditControllerList } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { AuditFilters, filterRequest, filterVocabulary } from './audit-log-model';
import { useAuditLogMeta } from './useAuditLogMeta';

/** The API rejected the event prefix, e.g. a plugin domain that was unloaded after meta loaded. */
export function rejectsEventPrefix(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 400) return false;
  const message = (error.body as { message?: string | string[] } | undefined)?.message;
  return [message ?? []].flat().some((text) => text.includes('eventPrefix'));
}

export function useAuditLogActivity({
  applied,
  cursors,
}: {
  applied: AuditFilters;
  cursors: Array<number | undefined>;
}) {
  const { hasPermission } = useAuth();
  const meta = useAuditLogMeta();
  // Applied filters can turn invalid once meta loads; never fall back to an unfiltered list then.
  const parsed = filterRequest(applied, filterVocabulary(meta.data));
  const request = { ...parsed.request, beforeId: cursors.at(-1), limit: 50 };
  const activity = useAuditControllerList({ query: request }, undefined, {
    enabled: hasPermission('system.audit.read') && !parsed.error,
  });
  const filterError = parsed.error ?? (rejectsEventPrefix(activity.error) ? 'invalidEventPrefix' : undefined);
  return { activity, filterError };
}
