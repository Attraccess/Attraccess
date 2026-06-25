import { Chip, cn } from '@heroui/react';
import { ArrowUpCircleIcon, CheckCircleIcon, GitCommitHorizontalIcon, PackageIcon, TagIcon, WifiOffIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useSystemServiceGetCurrentVersion, useSystemServiceGetUpdateStatus } from '@attraccess/react-query-client';
import en from './en.json';
import de from './de.json';

export type VersionInfoCardProps = {
  className?: string;
};

const GITHUB_REPO = 'https://github.com/Attraccess/Attraccess';

export function VersionInfoCard({ className }: VersionInfoCardProps = {}) {
  const { t } = useTranslations({ en, de });
  const { data: versionInfo } = useSystemServiceGetCurrentVersion();
  const { data: updateStatus } = useSystemServiceGetUpdateStatus();

  const isDev = !versionInfo?.version || versionInfo.version === '0.0.0-dev';

  const updateChip = updateStatus ? (
    updateStatus.checkSucceeded ? (
      updateStatus.isUpdateAvailable ? (
        <Chip color="warning" variant="soft">
          <div className="flex items-center gap-1">
            <ArrowUpCircleIcon size={14} />
            {t('updateAvailable')}
          </div>
        </Chip>
      ) : (
        <Chip color="success" variant="soft">
          <div className="flex items-center gap-1">
            <CheckCircleIcon size={14} />
            {t('upToDate')}
          </div>
        </Chip>
      )
    ) : (
      <Chip color="default" variant="soft">
        <div className="flex items-center gap-1">
          <WifiOffIcon size={14} />
          {t('checkFailed')}
        </div>
      </Chip>
    )
  ) : null;

  const releaseUrl = versionInfo?.version && !isDev
    ? `${GITHUB_REPO}/releases/tag/v${versionInfo.version}`
    : `${GITHUB_REPO}/releases`;

  const commitUrl = versionInfo?.commitHash
    ? `${GITHUB_REPO}/commit/${versionInfo.commitHash}`
    : null;

  return (
    <section
      className={cn(
        'w-full flex flex-col gap-4 rounded-large border border-default-200 bg-default-50 p-6',
        className,
      )}
      data-cy="version-info-section"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-default-700">
          <PackageIcon size={18} />
          <h3 className="text-sm uppercase tracking-wide font-semibold">{t('title')}</h3>
        </div>
        {updateChip}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-default-600 text-sm">
            <TagIcon size={14} />
            <span>{t('currentVersion')}</span>
          </div>
          {isDev ? (
            <span className="text-sm text-default-500 font-mono">{t('devVersion')}</span>
          ) : (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-primary hover:underline"
            >
              v{versionInfo?.version}
            </a>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-default-600 text-sm">
            <GitCommitHorizontalIcon size={14} />
            <span>{t('commitHash')}</span>
          </div>
          {commitUrl ? (
            <a
              href={commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-primary hover:underline"
            >
              {versionInfo?.commitHash?.slice(0, 8)}
            </a>
          ) : (
            <span className="text-sm font-mono text-default-400">{t('noCommit')}</span>
          )}
        </div>

        {updateStatus?.isUpdateAvailable && updateStatus.latestRelease && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-default-600 text-sm">
              <ArrowUpCircleIcon size={14} />
              <span>{t('latestVersion', { version: updateStatus.latestVersion ?? '' })}</span>
            </div>
            <a
              href={updateStatus.latestRelease.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {t('viewRelease')}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
