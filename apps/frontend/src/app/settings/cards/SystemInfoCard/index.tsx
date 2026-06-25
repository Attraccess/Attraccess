import { Card, CardContent, CardHeader, Skeleton } from '@heroui/react';
import { ActivityIcon, ClockIcon, CpuIcon, FolderIcon, ServerIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSystemServiceGetSystemInfo } from '@attraccess/react-query-client';
import { formatDuration } from '../../../../utils/duration';
import en from './en.json';
import de from './de.json';

export type SystemInfoCardProps = {
  className?: string;
};

export function SystemInfoCard({ className }: SystemInfoCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const { data } = useSystemServiceGetSystemInfo();

  return (
    <Card className={className} data-cy="system-info-section">
      <CardHeader className="flex items-center gap-2 text-default-700">
        <ServerIcon size={18} />
        <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {[
          { icon: <UsersIcon size={14} />, label: t('users'), value: data?.usersTotal },
          { icon: <CpuIcon size={14} />, label: t('resources'), value: data?.resourcesTotal },
          { icon: <FolderIcon size={14} />, label: t('projects'), value: data?.projectsTotal },
          { icon: <ActivityIcon size={14} />, label: t('activeAuthSessions'), value: data?.activeAuthSessions },
          { icon: <ActivityIcon size={14} />, label: t('activeResourceUsageSessions'), value: data?.activeResourceUsageSessions },
          { icon: <ClockIcon size={14} />, label: t('uptime'), value: data != null ? formatDuration(data.uptimeSeconds) : undefined },
          { icon: <ServerIcon size={14} />, label: t('nodeVersion'), value: data?.nodeVersion },
        ].map(({ icon, label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-default-600 text-sm">
              {icon}
              <span>{label}</span>
            </div>
            <span className="text-sm font-medium text-default-800">
              {value != null ? value : <Skeleton className="w-8 h-4 rounded" />}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
