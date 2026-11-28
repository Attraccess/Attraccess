import { useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button, StandardModal, StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormSubmissionRequestDto, ResourceUsage } from '@attraccess/react-query-client';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useSwitchSessionProject } from './useSwitchSessionProject';
import { useSessionEndedNotice } from './useSessionEndedNotice';
import { ProjectListStatus } from './ProjectListStatus';
import en from './switchProject/en.json';
import de from './switchProject/de.json';

interface SwitchProjectDialogProps {
  resourceId: number;
  usage: ResourceUsage;
  onClose: () => void;
}

/** Picks the project the running session continues under; "No project" is a choice of its own. */
export function SwitchProjectDialog({ resourceId, usage, onClose }: Readonly<SwitchProjectDialogProps>) {
  const { t } = useTranslations({ en, de });
  // The session the dialog was opened for; `usage` follows whichever record runs now.
  const [openedFor] = useState(usage);
  const currentProjectId = openedFor.project?.id ?? null;
  // Undefined until something is picked.
  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  const [isCollectingForms, setIsCollectingForms] = useState(false);
  const switchProject = useSwitchSessionProject(resourceId, () => {
    clearFormsDraft();
    onClose();
  });
  useSessionEndedNotice(resourceId, openedFor.userId);
  // A switch cannot be taken back, so the dialog stays until its outcome is known.
  const isBusy = switchProject.isPending || isCollectingForms;
  // Not while busy: the live update of this dialog's own switch can arrive before its answer.
  const isReplaced = !isBusy && usage.id !== openedFor.id;

  // The current project is not offered; nothing else is a switch either.
  const unchanged = selected === undefined || selected === currentProjectId;

  const confirm = async () => {
    if (unchanged) return;
    setIsCollectingForms(true);
    let formSubmissions: FormSubmissionRequestDto[];
    try {
      formSubmissions = await requestForms('project-switch');
    } catch (error) {
      if ((error as Error).message === 'user_cancelled_forms') return;
      switchProject.reportError(error);
      return;
    } finally {
      setIsCollectingForms(false);
    }
    switchProject.mutate({
      path: { resourceId },
      // Naming the session keeps a switch from moving one that replaced it meanwhile.
      body: { usageId: openedFor.id, projectId: selected, formSubmissions },
    });
  };

  return (
    <>
      <StandardModal
        isOpen
        onOpenChange={(open) => {
          if (!open && !isBusy) onClose();
        }}
        size="md"
      >
        <ModalHeader>
          <ModalHeading>{t('dialog.title')}</ModalHeading>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t('dialog.description')}</p>
          {isReplaced ? (
            <StatusAlert status="warning" title={t('dialog.replaced.title')}>
              {t('dialog.replaced.description')}
            </StatusAlert>
          ) : (
            <>
              <ProjectsSelect
                value={selected}
                onChange={(projectId) => setSelected(projectId ?? null)}
                label={t('dialog.select')}
                placeholder={t('dialog.placeholder')}
                includeUnassignedOption
                unassignedLabel={t('noProject')}
                isDisabled={isBusy}
                disabledKeys={[currentProjectId]}
              />
              <ProjectListStatus />
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="tertiary" isDisabled={isBusy} onPress={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={unchanged || isReplaced}
            isPending={isBusy}
            onPress={() => void confirm()}
            data-cy="switch-project-confirm"
          >
            {t('dialog.confirm')}
          </Button>
        </ModalFooter>
      </StandardModal>
      {formsModal}
    </>
  );
}
