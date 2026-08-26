import { Chip, Skeleton } from '@heroui/react';
import { ArrowUpCircleIcon, CheckCircleIcon, WifiOffIcon } from 'lucide-react';
import { useFormatedDuration, useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useSystemServiceGetCurrentVersion,
  useSystemServiceGetSystemInfo,
  useSystemServiceGetUpdateStatus,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import en from './en.json';
import de from './de.json';

const GITHUB_REPO = 'https://github.com/Attraccess/Attraccess';

/**
 * Read-only instance facts: version, update status, and the totals the old `/settings` card grid
 * carried.
 *
 * Rebuilt on `SettingsRow` rather than re-mounting `VersionInfoCard` / `SystemInfoCard`: both were
 * label-left/value-right lists inside a Card — exactly what a row is — and both painted their text
 * with `text-default-600`/`-700`/`-800`, which emit no CSS under v3 (ATT-858).
 *
 * Links use `text-link`, not `text-primary`: v3's palette has no `--color-primary` at all, so
 * `text-primary` is the same class of dead token the rebuild exists to remove.
 */
export function AboutSection() {
  const { t } = useTranslations({ en, de });

  const { data: versionInfo, isLoading: isVersionLoading } = useSystemServiceGetCurrentVersion();
  const { data: updateStatus } = useSystemServiceGetUpdateStatus();
  const { data: systemInfo } = useSystemServiceGetSystemInfo();
  const formattedUptime = useFormatedDuration((systemInfo?.uptimeSeconds ?? 0) / 60);

  const isDev = !isVersionLoading && (!versionInfo?.version || versionInfo.version === '0.0.0-dev');
  const releaseUrl =
    versionInfo?.version && !isDev ? `${GITHUB_REPO}/releases/tag/v${versionInfo.version}` : `${GITHUB_REPO}/releases`;
  const commitUrl = versionInfo?.commitHash ? `${GITHUB_REPO}/commit/${versionInfo.commitHash}` : null;

  const linkClass = 'text-sm font-mono text-link hover:underline';

  const systemFacts: { key: string; value: string | number | undefined }[] = [
    { key: 'users', value: systemInfo?.usersTotal },
    { key: 'resources', value: systemInfo?.resourcesTotal },
    { key: 'projects', value: systemInfo?.projectsTotal },
    { key: 'activeAuthSessions', value: systemInfo?.activeAuthSessions },
    { key: 'activeResourceUsageSessions', value: systemInfo?.activeResourceUsageSessions },
    { key: 'uptime', value: systemInfo ? formattedUptime : undefined },
    { key: 'nodeVersion', value: systemInfo?.nodeVersion },
  ];

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <div className="flex flex-col">
        <SettingsRow label={t('version.currentVersion')} data-testid="about-current-version">
          {isVersionLoading ? (
            <Skeleton className="h-4 w-20 rounded" />
          ) : isDev ? (
            <span className="font-mono text-sm text-muted">{t('version.devVersion')}</span>
          ) : (
            <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              v{versionInfo?.version}
            </a>
          )}
        </SettingsRow>

        <SettingsRow label={t('version.commitHash')}>
          {commitUrl ? (
            <a href={commitUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {versionInfo?.commitHash?.slice(0, 8)}
            </a>
          ) : (
            <span className="font-mono text-sm text-muted">{t('version.noCommit')}</span>
          )}
        </SettingsRow>

        {updateStatus && (
          <SettingsRow
            label={t('version.latestVersion')}
            hint={updateStatus.isUpdateAvailable ? updateStatus.latestVersion : undefined}
            data-testid="about-update-status"
          >
            {!updateStatus.checkSucceeded ? (
              <Chip color="default" variant="soft">
                <span className="flex items-center gap-1">
                  <WifiOffIcon size={14} />
                  {t('version.checkFailed')}
                </span>
              </Chip>
            ) : updateStatus.isUpdateAvailable ? (
              <span className="flex items-center gap-2">
                <Chip color="warning" variant="soft">
                  <span className="flex items-center gap-1">
                    <ArrowUpCircleIcon size={14} />
                    {t('version.updateAvailable')}
                  </span>
                </Chip>
                {updateStatus.latestRelease && (
                  <a
                    href={updateStatus.latestRelease.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-link hover:underline"
                  >
                    {t('version.viewRelease')}
                  </a>
                )}
              </span>
            ) : (
              <Chip color="success" variant="soft">
                <span className="flex items-center gap-1">
                  <CheckCircleIcon size={14} />
                  {t('version.upToDate')}
                </span>
              </Chip>
            )}
          </SettingsRow>
        )}

        {systemFacts.map(({ key, value }) => (
          <SettingsRow key={key} label={t(`system.${key}`)} data-testid={`about-${key}`}>
            {value != null ? (
              <span className="text-sm font-medium text-foreground">{value}</span>
            ) : (
              <Skeleton className="h-4 w-8 rounded" />
            )}
          </SettingsRow>
        ))}
      </div>
    </SettingsSection>
  );
}

export default AboutSection;
