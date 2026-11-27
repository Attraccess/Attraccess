import { useState } from 'react';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button, StandardModal, useTranslations } from '@attraccess/plugins-frontend-ui';
import { FormSubmissionRequestDto, ResourceUsage } from '@attraccess/react-query-client';
import { ProjectsSelect } from '../../../../../components/projectsSelect';
import { useResourceFormsSubmission } from '../../../forms/hooks/useResourceFormsSubmission';
import { useSwitchSessionProject } from './useSwitchSessionProject';
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
  const currentProjectId = usage.project?.id ?? null;
  // Undefined until something is picked.
  const [selected, setSelected] = useState<number | null | undefined>(undefined);
  const { requestForms, modal: formsModal, clearFormsDraft } = useResourceFormsSubmission(resourceId);
  const [isCollectingForms, setIsCollectingForms] = useState(false);
  const switchProject = useSwitchSessionProject(resourceId, () => {
    clearFormsDraft();
    onClose();
  });

  const unchanged = selected === undefined || selected === currentProjectId;

  const confirm = async () => {
    if (selected === undefined || unchanged) return;
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
      body: { usageId: usage.id, projectId: selected, formSubmissions },
    });
  };

  return (
    <>
      <StandardModal
        isOpen
        onOpenChange={(open) => {
          if (!open && !isCollectingForms) onClose();
        }}
        size="md"
      >
        <ModalHeader>
          <ModalHeading>{t('dialog.title')}</ModalHeading>
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          <p className="text-sm text-muted">{t('dialog.description')}</p>
          <ProjectsSelect
            value={selected ?? undefined}
            onChange={(projectId) => setSelected(projectId ?? null)}
            label={t('dialog.select')}
            placeholder={selected === null ? t('noProject') : t('dialog.placeholder')}
            includeUnassignedOption
            unassignedLabel={t('noProject')}
          />
          {selected !== undefined && unchanged && <p className="text-sm text-muted">{t('dialog.unchanged')}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="tertiary" onPress={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={unchanged}
            isPending={switchProject.isPending || isCollectingForms}
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
