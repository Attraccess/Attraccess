import { useAuditServiceAuditControllerList } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';
import { AuditFilters, filterRequest } from './audit-log-model';
import { useAuditLogMeta } from './useAuditLogMeta';

export function useAuditLogActivity({
  applied,
  cursors,
}: {
  applied: AuditFilters;
  cursors: Array<number | undefined>;
}) {
  const { hasPermission } = useAuth();
  const meta = useAuditLogMeta();
  const parsed = filterRequest(applied, meta.data?.subjectTypes);
  const request = { ...parsed.request, beforeId: cursors.at(-1), limit: 50 };
  return useAuditServiceAuditControllerList(request, undefined, { enabled: hasPermission('system.audit.read') });
}
