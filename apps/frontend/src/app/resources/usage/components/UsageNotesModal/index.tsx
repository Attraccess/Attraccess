import { memo } from 'react';
import { Modal, ModalContent } from '../../../../../utils/heroui-compat';
import { ModalHeader, ModalBody, ModalFooter, Button, Spinner, Textarea } from '@heroui/react';
import { FormFieldType, ResourceUsage, ResourceUsageAction } from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en';
import de from './translations/de';
import { DateTimeDisplay } from '@attraccess/plugins-frontend-ui';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
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
  }: UsageNotesModalProps) => {
    const { t } = useTranslations({ en, de });
    const { user } = useAuth();

    if (!isOpen) return null;

    return (
      <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">{t('sessionNotes')}</ModalHeader>
          <ModalBody>
            {session ? (
              <div className="space-y-4">
                {session.usageAction === ResourceUsageAction.USAGE && projectLabel && projectPlaceholder && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{projectLabel}</p>
                    {session.endTime && session.userId === user?.id && resolveProjectId && onProjectChange ? (
                      <ProjectsSelect
                        label={t('projectSelectLabel')}
                        value={resolveProjectId(session)}
                        onValueChange={(projectId) => onProjectChange(session, projectId)}
                        placeholder={projectPlaceholder}
                        includeUnassignedOption
                        unassignedLabel={projectPlaceholder}
                        isDisabled={Boolean(updatingSessionIds?.[session.id])}
                      />
                    ) : (
                      <p className="text-sm text-default-500">{session.project?.name ?? projectPlaceholder}</p>
                    )}
                  </div>
                )}

                <Textarea
                  labelPlacement="outside"
                  value={session.startNotes || t('noNotesProvided')}
                  label={t('startNotes')}
                  readOnly
                />

                {session.endTime && (
                  <Textarea
                    labelPlacement="outside"
                    value={session.endNotes || t('noNotesProvided')}
                    label={t('endNotes')}
                    readOnly
                  />
                )}

                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <p>
                    {t('sessionStarted')}: <DateTimeDisplay date={session.startTime} />
                  </p>
                  {session.endTime && (
                    <p>
                      {t('sessionEnded')}: <DateTimeDisplay date={session.endTime} />
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('formsTitle')}</p>
                  {renderFormSubmissions(session, t)}
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-4">
                <Spinner size="md" color="primary" />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="primary" variant="light" onPress={onClose}>
              {t('close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  });

UsageNotesModal.displayName = 'UsageNotesModal';

function renderFormSubmissions(session: ResourceUsage, t: (key: string) => string) {
  if (!session.formSubmissions || session.formSubmissions.length === 0) {
    return <p className="text-xs text-default-400">{t('noForms')}</p>;
  }

  return session.formSubmissions.map((submission) => {
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
