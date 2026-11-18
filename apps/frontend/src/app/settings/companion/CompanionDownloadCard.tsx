import { Alert, AlertContent, AlertTitle, Card, Chip, Spinner } from '@heroui/react';
import { DownloadIcon, MonitorIcon } from 'lucide-react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useGetCompanionVersions } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../api/index';
import en from './en.json';
import de from './de.json';

function platformLabel(platform: string, arch: string): string {
  if (platform === 'win32' || platform === 'windows') return 'Windows x64';
  if (platform === 'darwin' || platform === 'macos') return 'macOS (Universal)';
  if (platform === 'linux' && arch === 'arm64') return 'Linux arm64';
  if (platform === 'linux') return 'Linux x64';
  return `${platform} ${arch}`;
}

const downloadUrl = (platform: string, arch: string) => `${getBaseUrl()}/api/companion/download/${platform}/${arch}`;

export function CompanionDownloadCard() {
  const { t } = useTranslations({ en, de });
  const { data: manifest, isLoading: manifestLoading } = useGetCompanionVersions();
  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold">{t('download.title')}</span>
          {manifest && !manifestLoading && (manifest.platforms?.length ?? 0) > 0 && (
            <Chip color="success" size="sm">
              {t('version.label', { version: manifest.version })}
            </Chip>
          )}
        </div>
        <span className="text-sm text-default-500">{t('download.subtitle')}</span>
      </Card.Header>
      <Card.Content>
        {(!manifest || (manifest.platforms?.length ?? 0) === 0) && !manifestLoading ? (
          <Alert color="default">
            <AlertContent>
              <AlertTitle>{t('download.noBinaries')}</AlertTitle>
            </AlertContent>
          </Alert>
        ) : manifestLoading ? (
          <Spinner size="sm" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {manifest?.platforms.map((entry) => (
              <Card key={`${entry.platform}-${entry.arch}`} className="border border-divider">
                <Card.Content className="flex flex-col items-center gap-3 py-4">
                  <MonitorIcon size={28} className="text-default-400" />
                  <span className="text-sm font-medium text-center">{platformLabel(entry.platform, entry.arch)}</span>
                  <a href={downloadUrl(entry.platform, entry.arch)} download={entry.filename} className="w-full">
                    <Button variant="primary" size="sm" className="w-full">
                      <DownloadIcon className="w-4 h-4" />
                      {t('download.button')}
                    </Button>
                  </a>
                </Card.Content>
              </Card>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
