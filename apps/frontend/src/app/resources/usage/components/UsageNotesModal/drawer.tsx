import { memo } from 'react';
import { Alert, DrawerBody, DrawerHeader, DrawerHeading, Button, Spinner } from '@heroui/react';
import { ResourceUsageAction } from '@attraccess/react-query-client';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { DurationDisplay } from '@attraccess/plugins-frontend-ui';
import { X } from 'lucide-react';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { useAuth } from '../../../../../hooks/useAuth';
import { UsageNotesDrawerProps } from './drawer.usage-notes-drawer-props';
import { NotesField } from './drawer.notes-field';
import { hasRenderableFormSubmissions } from './drawer.has-renderable-form-submissions';
import { renderFormSubmissions } from './drawer.render-form-submissions';
export const UsageNotesDrawer = memo(
  ({
    isOpen,
    onClose,
    session,
    projectLabel,
    projectPlaceholder,
    resolveProjectId,
    updatingSessionIds,
    onProjectChange,
    operatingDurationMs,
    onOpenBilling,
    error,
    onRetry,
    billingError,
    onRetryBilling,
    isRetryingBilling,
    operatingDurationError,
    onRetryOperatingDuration,
    isRetryingOperatingDuration,
  }: UsageNotesDrawerProps) => {
    const { t } = useTranslations({ en, de });
    const { user } = useAuth();

    if (!isOpen) return null;

    const showProjectSection =
      session?.usageAction === ResourceUsageAction.USAGE && Boolean(projectLabel) && Boolean(projectPlaceholder);
    const canEditProject = Boolean(
      session?.endTime && session?.userId === user?.id && resolveProjectId && onProjectChange,
    );
    const showForms = session ? hasRenderableFormSubmissions(session) : false;

    return (
      <StandardDrawer
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DrawerHeader>
          <div className="flex w-full items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <DrawerHeading className="text-lg font-semibold">{t('sessionNotes')}</DrawerHeading>
              {session && (
                <div className="text-xs text-default-500 space-y-0.5">
                  <p>
                    {t('sessionStarted')}: <DateTimeDisplay date={session.startTime} />
                  </p>
                  {session.endTime && (
                    <p>
                      {t('sessionEnded')}: <DateTimeDisplay date={session.endTime} />
                    </p>
                  )}
                </div>
              )}
            </div>
            <Button isIconOnly variant="ghost" aria-label={t('close')} onPress={onClose}>
              <X size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody>
          {error ? (
            <div role="alert">
              <p>{t('loadError')}</p>
              <Button variant="secondary" onPress={onRetry}>
                {t('retry')}
              </Button>
            </div>
          ) : session ? (
            <div className="space-y-6">
              {onOpenBilling && (
                <Button variant="secondary" onPress={onOpenBilling}>
                  {t('openBilling')}
                </Button>
              )}
              {billingError && (
                <Alert status="warning" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t('billingLoadError')}</Alert.Title>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onPress={onRetryBilling}
                      isPending={isRetryingBilling}
                    >
                      {t('retryBilling')}
                    </Button>
                  </Alert.Content>
                </Alert>
              )}
              {showProjectSection && (
                <section className="space-y-2">
                  {canEditProject && resolveProjectId && onProjectChange ? (
                    <ProjectsSelect
                      label={t('projectSelectLabel')}
                      value={resolveProjectId(session)}
                      onChange={(projectId) => onProjectChange(session, projectId)}
                      placeholder={projectPlaceholder}
                      includeUnassignedOption
                      unassignedLabel={projectPlaceholder}
                      isDisabled={Boolean(updatingSessionIds?.[session.id])}
                    />
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {t('projectSelectLabel')}
                      </p>
                      <p className="text-sm text-default-500">{session.project?.name ?? projectPlaceholder}</p>
                    </>
                  )}
                </section>
              )}

              {session.supervisorUser && (
                <section className="space-y-2 border-t border-divider pt-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('supervisor')}</p>
                  <AttraccessUser user={session.supervisorUser} />
                </section>
              )}

              {(operatingDurationMs !== undefined || operatingDurationError) && (
                <section className="space-y-2 border-t border-divider pt-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('machineRunningTime')}</p>
                  {operatingDurationMs !== undefined && <DurationDisplay minutes={operatingDurationMs / 60_000} />}
                  {operatingDurationError && (
                    <Alert status="warning" role="alert">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>{t('operatingDurationLoadError')}</Alert.Title>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          onPress={onRetryOperatingDuration}
                          isPending={isRetryingOperatingDuration}
                        >
                          {t('retryOperatingDuration')}
                        </Button>
                      </Alert.Content>
                    </Alert>
                  )}
                </section>
              )}

              <section className="space-y-3 border-t border-divider pt-4">
                <NotesField label={t('startNotes')} value={session.startNotes} emptyText={t('noNotesProvided')} />
                {session.endTime && (
                  <NotesField label={t('endNotes')} value={session.endNotes} emptyText={t('noNotesProvided')} />
                )}
              </section>

              {showForms && (
                <section className="space-y-2 border-t border-divider pt-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('formsTitle')}</p>
                  {renderFormSubmissions(session, t)}
                </section>
              )}
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <Spinner color="accent" />
            </div>
          )}
        </DrawerBody>
      </StandardDrawer>
    );
  },
);

UsageNotesDrawer.displayName = 'UsageNotesDrawer';
export { type UsageNotesDrawerProps } from './drawer.usage-notes-drawer-props';
