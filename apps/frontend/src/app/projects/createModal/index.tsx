import {
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  useDisclosure,
} from '@heroui/react';
import { PageHeader } from '../../../components/pageHeader';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ImageUpload } from '../../../components/imageUpload';
import { useCallback, useRef, useState } from 'react';
import {
  ApiError,
  useProjectsServiceCreateProject,
  useProjectsServiceFindManyProjectsKey,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function CreateProjectModal({ children }: Props) {
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

  const { mutate: createProject } = useProjectsServiceCreateProject({
    onSuccess: (project) => {
      toast.success({
        title: t('success.title'),
        description: t('success.description', { name: project.name }),
      });
      queryClient.invalidateQueries({
        queryKey: [useProjectsServiceFindManyProjectsKey],
      });
      onClose();
    },
    onError: (error) => {
      toast.apiError({
        error: error as ApiError,
        t,
        tExists,
        baseTranslationKey: 'api',
      });
    },
  });

  const [logo, setLogo] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = useCallback(() => {
    if (!formRef.current?.checkValidity()) {
      return;
    }

    createProject({
      formData: {
        name,
        description,
        logo: logo ?? undefined,
      },
    });
  }, [formRef, name, description, logo, createProject]);

  return (
    <>
      {children(onOpen)}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>
            <PageHeader title={t('title')} noMargin />
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
              />
              <input type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button color="primary" onPress={onSubmit}>
              {t('actions.create')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
