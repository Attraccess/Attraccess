import {
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  useDisclosure,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';
import { ApiError, useUsersServiceFindManyKey, useUsersServiceInviteUser } from '@attraccess/react-query-client';
import { PageHeader } from '../../../components/pageHeader';
import { useCallback, useRef, useState } from 'react';
import { useToastMessage } from '../../../components/toastProvider';
import { useQueryClient } from '@tanstack/react-query';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

interface Props {
  children: (onOpen: () => void) => React.ReactNode;
}

export function InviteUserModal(props: Props) {
  const { children } = props;
  const { isOpen, onOpen, onClose } = useDisclosure();
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

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const { mutate: inviteUser, isPending } = useUsersServiceInviteUser({
    onSuccess: () => {
      toast.success({
        title: t('success.title'),
        description: t('success.description'),
      });
      queryClient.invalidateQueries({
        queryKey: [useUsersServiceFindManyKey],
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

  const onSubmit = useCallback(() => {
    if (!formRef.current) {
      return;
    }

    if (!formRef.current.checkValidity()) {
      return;
    }

    inviteUser({
      requestBody: {
        username,
        email,
      },
    });
  }, [inviteUser, username, email]);

  return (
    <>
      {children(onOpen)}
      <Modal isOpen={isOpen} onClose={onClose}>
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
              className="flex flex-col gap-4"
            >
              <Input
                label={t('inputs.username.label')}
                name="username"
                isRequired
                required
                value={username}
                onValueChange={setUsername}
              />
              <Input
                label={t('inputs.email.label')}
                name="email"
                type="email"
                isRequired
                required
                value={email}
                onValueChange={setEmail}
              />
              <input type="submit" hidden />
            </Form>
          </ModalBody>

          <ModalFooter>
            <Button color="primary" onPress={onSubmit} isLoading={isPending}>
              {t('actions.invite')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
