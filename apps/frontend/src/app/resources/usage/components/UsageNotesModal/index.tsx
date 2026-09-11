import { memo } from 'react';
import { DrawerBody, DrawerHeader, Button, Spinner } from '@heroui/react';
import { FormFieldType, ResourceUsage, ResourceUsageAction } from '@attraccess/react-query-client';
import { AttraccessUser, useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { DurationDisplay } from '@attraccess/plugins-frontend-ui';
import { X } from 'lucide-react';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { StandardDrawer } from '../../../../../components/standardDrawer';
import { useAuth } from '../../../../../hooks/useAuth';

interface UsageNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ResourceUsage | null;
  projectLabel?: string;
  projectPlaceholder?: string;
  resolveProjectId?: (session: ResourceUsage) => number | null;
  updatingSessionIds?: Record<number, boolean>;
  onProjectChange?: (session: ResourceUsage, projectId: number | undefined) => void;
  operatingDurationMs?: number;
}

export const UsageNotesModal = memo(
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
  }: UsageNotesModalProps) => {
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
              <h2 className="text-lg font-semibold">{t('sessionNotes')}</h2>
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
          {session ? (
            <div className="space-y-6">
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

              {operatingDurationMs !== undefined && (
                <section className="space-y-2 border-t border-divider pt-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('machineRunningTime')}</p>
                  <DurationDisplay minutes={operatingDurationMs / 60_000} />
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

UsageNotesModal.displayName = 'UsageNotesModal';

interface NotesFieldProps {
  label: string;
  value: string | null | undefined;
  emptyText: string;
}

function NotesField({ label, value, emptyText }: NotesFieldProps) {
  const hasNote = Boolean(value?.trim());

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      {hasNote ? (
        <div className="rounded-xl border border-divider bg-default-50 px-4 py-3 text-sm leading-6 text-default-700 shadow-sm dark:bg-default-100/10">
          <p className="whitespace-pre-wrap break-words">{value}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-divider bg-default-50/60 px-4 py-3 dark:bg-default-100/5">
          <p className="text-sm italic text-default-400">{emptyText}</p>
        </div>
      )}
    </div>
  );
}

function hasRenderableFormSubmissions(session: ResourceUsage): boolean {
  if (!session.formSubmissions || session.formSubmissions.length === 0) return false;
  return session.formSubmissions.some((submission) => {
    const entries = Object.values(
      (submission.data as Record<string, { value: string; fieldDefinition: { name: string; type: FormFieldType } }>) ??
        {},
    );
    return entries.length > 0;
  });
}

function renderFormSubmissions(session: ResourceUsage, t: (key: string) => string) {
  return session.formSubmissions?.map((submission) => {
    const entries = Object.values(
      (submission.data as Record<string, { value: string; fieldDefinition: { name: string; type: FormFieldType } }>) ??
        {},
    );

    if (!entries.length) {
      return null;
    }

    return (
      <div key={submission.id} className="rounded-lg border border-default-200 dark:border-default-100 p-3 space-y-2">
        <p className="text-xs font-medium text-default-500">{submission.form?.name ?? `Form #${submission.formId}`}</p>
        {entries.map((entry, index) => (
          <div key={`${submission.id}-${index}`}>
            <p className="text-sm font-semibold text-default-600">{entry.fieldDefinition.name}</p>
            <p className="text-sm text-default-500">{formatFieldValue(entry, t)}</p>
          </div>
        ))}
      </div>
    );
  });
}

function formatFieldValue(
  entry: { value: string; fieldDefinition: { type: FormFieldType } },
  t: (key: string) => string,
) {
  switch (entry.fieldDefinition.type) {
    case FormFieldType.BOOLEAN:
      return entry.value === 'true' ? t('booleanYes') : t('booleanNo');
    case FormFieldType.NUMBER:
    case FormFieldType.SELECT:
      return entry.value;
    default:
      return entry.value;
  }
}
