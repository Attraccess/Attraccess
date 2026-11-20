import { useAuditControllerList } from '@attraccess/react-query-client';
import { type DefaultOptions, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../hooks/useAuth';
import { AuditFilters, filterRequest, filterVocabulary, rejectsEventPrefix } from './audit-log-model';
import { useAuditLogMeta } from './useAuditLogMeta';

/** Applies the client's default retry option, which may be a boolean, a count or a function. */
function defaultRetries(
  retry: NonNullable<DefaultOptions['queries']>['retry'],
  failureCount: number,
  error: unknown,
): boolean {
  // The client's retry function is typed for its default error type, Error; the generated hook reports `unknown`.
  if (typeof retry === 'function') return retry(failureCount, error as Error);
  if (typeof retry === 'number') return failureCount < retry;
  // TanStack Query retries three times when no default is set.
  return retry ?? failureCount < 3;
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
  const defaultRetry = useQueryClient().getDefaultOptions().queries?.retry;
  // Applied filters can turn invalid once meta loads; never fall back to an unfiltered list then.
  const parsed = filterRequest(applied, filterVocabulary(meta.data));
  const request = { ...parsed.request, beforeId: cursors.at(-1), limit: 50 };
  const activity = useAuditControllerList({ query: request }, undefined, {
    enabled: hasPermission('system.audit.read') && !parsed.error,
    // A rejected prefix stays rejected: retrying only delays the validation message by the retry backoff.
    retry: (failureCount, error) => !rejectsEventPrefix(error) && defaultRetries(defaultRetry, failureCount, error),
    // Nor does asking again on window focus or reconnect; clearing or changing the filter starts a new query.
    refetchOnWindowFocus: (query) => !rejectsEventPrefix(query.state.error),
    refetchOnReconnect: (query) => !rejectsEventPrefix(query.state.error),
  });
  const appliedFilterError = parsed.error ?? (rejectsEventPrefix(activity.error) ? 'invalidEventPrefix' : undefined);
  /** `filterQuery` is the applied filters as list query parameters; undefined while they are invalid. */
  return { activity, appliedFilterError, filterQuery: parsed.request };
}
