import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { SSOProvider, UserRole } from '@attraccess/react-query-client';
import { Chip } from '@heroui/react';

export function SsoAssignmentBadges({
  assignments,
  providersById,
  t,
}: {
  assignments: UserRole[];
  providersById?: Map<number, SSOProvider>;
  t: ReturnType<typeof useTranslations>['t'];
}) {
  if (assignments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 ml-1">
      {assignments.map((ur) => {
        const providerName = ur.ssoProviderId
          ? (providersById?.get(ur.ssoProviderId)?.name ?? `#${ur.ssoProviderId}`)
          : (ur.ssoProviderType ?? 'SSO');
        const label = ur.externalValue ? `${providerName} · ${ur.externalValue}` : providerName;
        return (
          <Chip key={`${ur.ssoProviderId}-${ur.externalValue}`} size="sm" color="warning" variant="soft">
            {t('ssoAssignment.assignedBy')}: {label}
          </Chip>
        );
      })}
    </div>
  );
}
