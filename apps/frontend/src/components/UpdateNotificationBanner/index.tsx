import { useCallback, useMemo, useState } from 'react';
import { Modal, ModalContent } from '../../utils/heroui-compat';
import { Button, ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ArrowUpCircle, ExternalLink, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSystemServiceGetUpdateStatus } from '@attraccess/react-query-client';
import { UPDATE_CHECK_CACHE_TTL_MS } from '@attraccess/shared';
import { useAuth } from '../../hooks/useAuth';
import { readDismissedVersion, writeDismissedVersion } from './storage';
import en from './en.json';
import de from './de.json';

const SUPPORTED_DOC_LANGUAGES = new Set(['en', 'de']);
const DEFAULT_DOC_LANGUAGE = 'en';

export function buildUpdateDocsPath(language: string | undefined): string {
  const normalized = language?.toLowerCase() ?? '';
  const lang = SUPPORTED_DOC_LANGUAGES.has(normalized) ? normalized : DEFAULT_DOC_LANGUAGE;
  return `/docs/#/${lang}/installation/updating`;
}

export function UpdateNotificationBanner() {
  const { t, language } = useTranslations({ en, de });
  const { hasPermission } = useAuth();
  const canSeeBanner = hasPermission('canManageSystemConfiguration');
  const updateDocsPath = buildUpdateDocsPath(language);

  const { data: updateStatus } = useSystemServiceGetUpdateStatus({}, undefined, {
    enabled: canSeeBanner,
    staleTime: UPDATE_CHECK_CACHE_TTL_MS,
    refetchInterval: UPDATE_CHECK_CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => readDismissedVersion());
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);

  const shouldRender = useMemo(() => {
    if (!canSeeBanner) return false;
    if (!updateStatus) return false;
    if (!updateStatus.isUpdateAvailable) return false;
    if (!updateStatus.latestVersion) return false;
    if (dismissedVersion && dismissedVersion === updateStatus.latestVersion) return false;
    return true;
  }, [canSeeBanner, updateStatus, dismissedVersion]);

  const onDismiss = useCallback(() => {
    if (!updateStatus?.latestVersion) return;
    writeDismissedVersion(updateStatus.latestVersion);
    setDismissedVersion(updateStatus.latestVersion);
  }, [updateStatus]);

  const onOpenReleaseNotes = useCallback(() => setIsReleaseNotesOpen(true), []);
  const onCloseReleaseNotes = useCallback(() => setIsReleaseNotesOpen(false), []);

  if (!shouldRender || !updateStatus?.latestRelease || !updateStatus.latestVersion) {
    return null;
  }

  const release = updateStatus.latestRelease;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        data-testid="update-notification-banner"
        className="w-full bg-primary-50 dark:bg-primary-900/30 border-b border-primary-200 dark:border-primary-800 px-4 py-3"
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3">
          <ArrowUpCircle className="text-primary-600 dark:text-primary-400 shrink-0" size={20} />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-sm text-foreground">{t('title')}</div>
            <div className="text-xs text-default-600 dark:text-default-400">
              {t('versionSummary', {
                current: updateStatus.currentVersion,
                latest: updateStatus.latestVersion,
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="flat" color="primary" onPress={onOpenReleaseNotes}>
              {t('viewReleaseNotes')}
            </Button>
            <Button
              size="sm"
              color="primary"
              endContent={<ExternalLink size={14} />}
              as="a"
              href={updateDocsPath}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('howToUpdate')}
            </Button>
            <Button
              size="sm"
              variant="light"
              isIconOnly
              aria-label={t('dismissThisVersion')}
              onPress={onDismiss}
            >
              <X size={16} />
            </Button>
          </div>
        </div>
      </div>

      <Modal isOpen={isReleaseNotesOpen} onOpenChange={setIsReleaseNotesOpen} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{t('releaseNotesModalTitle', { version: release.version })}</ModalHeader>
          <ModalBody>
            {release.body?.trim() ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.body}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-default-500">{t('releaseNotesFallback')}</div>
            )}
          </ModalBody>
          <ModalFooter className="flex-wrap gap-2 justify-between">
            <Button
              as="a"
              href={release.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="flat"
              endContent={<ExternalLink size={14} />}
            >
              {release.tagName}
            </Button>
            <Button color="primary" onPress={onCloseReleaseNotes}>
              {t('close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
