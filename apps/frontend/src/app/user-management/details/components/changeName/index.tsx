import {
  ApiError,
  useChangeUserName,
  useFindManyKey,
  useGetCurrentKey,
  useGetOneUserById,
  useGetOneUserByIdKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import { isSsoLinkedUser } from '../../../../../components/userNameForm/isSsoLinkedUser';
import { UserNameFormView } from '../../../../../components/userNameForm/UserNameFormView';
import { useUserNameFields } from '../../../../../components/userNameForm/useUserNameFields';
import de from '../../../../../components/userNameForm/de.json';
import en from '../../../../../components/userNameForm/en.json';

interface Props {
  userId: number;
}

/** User management → user → Profile: an administrator changes the first and last name. Read-only for SSO users. */
export function ChangeNameForm({ userId }: Readonly<Props>) {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: user, isLoading } = useGetOneUserById({ path: { id: userId } });
  const { firstName, setFirstName, lastName, setLastName } = useUserNameFields(user);

  const { mutate, isPending } = useChangeUserName(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useGetOneUserByIdKey] });
      queryClient.invalidateQueries({ queryKey: [useFindManyKey] });
      queryClient.invalidateQueries({ queryKey: [useGetCurrentKey] });
      showSuccess({ title: t('updated') });
    },
    onError: (error) => {
      const body = error instanceof ApiError ? (error.body as { message?: string | string[] } | undefined) : undefined;
      const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
      showError({ title: typeof message === 'string' && message.trim() ? message : t('updateFailed') });
    },
  });

  const onSubmit = useCallback(() => {
    mutate({ path: { id: userId }, body: { firstName: firstName.trim() || null, lastName: lastName.trim() || null } });
  }, [mutate, userId, firstName, lastName]);

  return (
    <UserNameFormView
      firstName={firstName}
      lastName={lastName}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onSubmit={onSubmit}
      isLoading={isLoading}
      isPending={isPending}
      isSsoManaged={isSsoLinkedUser(user)}
      isAdminView
    />
  );
}
