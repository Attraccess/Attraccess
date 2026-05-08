import { Button, Form, Input, Modal, ModalBackdrop, ModalBody, ModalContainer, ModalDialog, ModalFooter, ModalHeader, Textarea } from '@heroui/react';
import { useDisclosure } from '../../../utils/heroui-compat';
import { PageHeader } from '../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ImageUpload } from '../../../components/imageUpload';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  Project,
  useProjectsServiceCreateProject,
  useProjectsServiceFindManyProjectsKey,
  useProjectsServiceFindOneProject,
  UseProjectsServiceFindOneProjectKeyFn,
  useProjectsServiceUpdateProject,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { filenameToUrl } from '../../../api';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
  projectId?: number;
}

export function UpsertProjectModal(props: Props) {
  const { children, projectId } = props;

  const { isOpen, onOpen, onOpenChange, onClose } = useDisclosure();
  const { t, tExists } = useTranslations({
    en: {
      ...en,
      api: API_ERROR_TRANSLATIONS_EN,
    },
    de: {
      ...de,
      api: API_ERROR_TRANSLATIONS_DE,
    },
  });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: existingProject } = useProjectsServiceFindOneProject({ id: projectId as number }, undefined, {
    enabled: !!projectId,
  });

  const onSaveSuccess = useCallback(
    (project: Project, isCreate: boolean) => {
      toast.success({
        title: isCreate ? t('actions.create.success.title') : t('actions.update.success.title'),
        description: isCreate
          ? t('actions.create.success.description', { name: project.name })
          : t('actions.update.success.description', { name: project.name }),
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      });
      queryClient.invalidateQueries({
        queryKey: UseProjectsServiceFindOneProjectKeyFn({ id: project.id }),
      });
      onClose();
    },
    [t, queryClient, onClose, toast],
  );

  const onSaveError = useCallback(
    (error: ApiError) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
    [t, tExists, toast],
  );

  const { mutate: createProject, isPending: isCreating } = useProjectsServiceCreateProject({
    onSuccess: (project) => {
      onSaveSuccess(project, true);
    },
    onError: (error) => onSaveError(error as ApiError),
  });

  const { mutate: updateProject, isPending: isUpdating } = useProjectsServiceUpdateProject({
    onSuccess: (project) => {
      onSaveSuccess(project, false);
    },
    onError: (error) => onSaveError(error as ApiError),
  });

  const isSaving = useMemo(() => isCreating || isUpdating, [isCreating, isUpdating]);

  const [logo, setLogo] = useState<File | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (existingProject) {
      setName(existingProject.name);
      setDescription(existingProject.description);
    }
  }, [existingProject]);

  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) {
      return;
    }

    if (projectId) {
      updateProject({
        id: projectId,
        formData: {
          name,
          description,
          logo: logo ?? undefined,
          deleteLogo: logo === null,
        },
      });
    } else {
      createProject({
        formData: {
          name,
          description,
          logo: logo ?? undefined,
        },
      });
    }
  }, [formRef, name, description, logo, createProject, updateProject, projectId]);

  return (
    <>
      {children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            {() => (
              <>
                <ModalHeader>
                  <PageHeader title={projectId ? t('title.update') : t('title.create')} noMargin />
                </ModalHeader>

                <ModalBody>
                  <Form
                    ref={formRef}
                    onSubmit={(e) => {
                      e.preventDefault();
                      onSubmit();
                    }}
                  >
                    <Input label={t('inputs.name.label')} name="name" value={name} onValueChange={setName} />
                    <Textarea
                      label={t('inputs.description.label')}
                      name="description"
                      value={description}
                      onValueChange={setDescription}
                    />
                    <ImageUpload
                      id="project-logo-image-upload"
                      label={t('inputs.logo.label')}
                      onChange={setLogo}
                      autoScale={{ maxWidth: 600, maxHeight: 600 }}
                      currentImageUrl={existingProject?.logo ? filenameToUrl(existingProject.logo) : undefined}
                    />
                    <input type="submit" hidden />
                  </Form>
                </ModalBody>

                <ModalFooter>
                  <Button color="primary" onPress={onSubmit} isLoading={isSaving}>
                    {projectId ? t('actions.update.label') : t('actions.create.label')}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </>
  );
}
