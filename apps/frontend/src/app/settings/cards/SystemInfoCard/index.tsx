import { cn, Skeleton } from '@heroui/react';
import { ActivityIcon, ClockIcon, CpuIcon, FolderIcon, ServerIcon, UsersIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSystemServiceGetSystemInfo } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export type SystemInfoCardProps = {
  className?: string;
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

type MetricRowProps = {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
};

function MetricRow({ icon, label, value }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-default-600 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-sm font-medium text-default-800">{value}</span>
    </div>
  );
}

export function SystemInfoCard({ className }: SystemInfoCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const { data } = useSystemServiceGetSystemInfo();

  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="system-info-section"
    >
      <div className="flex items-center gap-2 text-default-700">
        <ServerIcon size={18} />
        <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
      </div>

      <div className="flex flex-col gap-3">
        <MetricRow
          icon={<UsersIcon size={14} />}
          label={t('users')}
          value={data ? data.usersTotal : <Skeleton className="w-8 h-4 rounded" />}
        />
        <MetricRow
          icon={<CpuIcon size={14} />}
          label={t('resources')}
          value={data ? data.resourcesTotal : <Skeleton className="w-8 h-4 rounded" />}
        />
        <MetricRow
          icon={<FolderIcon size={14} />}
          label={t('projects')}
          value={data ? data.projectsTotal : <Skeleton className="w-8 h-4 rounded" />}
        />
        <MetricRow
          icon={<ActivityIcon size={14} />}
          label={t('activeAuthSessions')}
          value={data ? data.activeAuthSessions : <Skeleton className="w-8 h-4 rounded" />}
        />
        <MetricRow
          icon={<ActivityIcon size={14} />}
          label={t('activeResourceUsageSessions')}
          value={data ? data.activeResourceUsageSessions : <Skeleton className="w-8 h-4 rounded" />}
        />
        <MetricRow
          icon={<ClockIcon size={14} />}
          label={t('uptime')}
          value={data ? formatUptime(data.uptimeSeconds) : <Skeleton className="w-12 h-4 rounded" />}
        />
        <MetricRow
          icon={<ServerIcon size={14} />}
          label={t('nodeVersion')}
          value={data ? <span className="font-mono text-xs">{data.nodeVersion}</span> : <Skeleton className="w-16 h-4 rounded" />}
        />
      </div>
    </section>
  );
}
