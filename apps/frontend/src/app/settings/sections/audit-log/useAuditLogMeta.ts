import { useAuditServiceAuditControllerMeta } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

export function useAuditLogMeta() {
  const { hasPermission } = useAuth();
  return useAuditServiceAuditControllerMeta(undefined, {
    enabled: hasPermission('system.audit.read') || hasPermission('system.settings.manage'),
  });
}
