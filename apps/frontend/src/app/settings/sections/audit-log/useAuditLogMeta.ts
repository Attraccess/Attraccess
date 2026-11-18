import { useAuditControllerMeta } from '@attraccess/react-query-client';
import { useAuth } from '../../../../hooks/useAuth';

export function useAuditLogMeta() {
  const { hasPermission } = useAuth();
  return useAuditControllerMeta({}, undefined, {
    enabled: hasPermission('system.audit.read') || hasPermission('system.settings.manage'),
  });
}
