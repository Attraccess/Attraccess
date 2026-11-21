import {
  ApiError,
  useChangeMyName,
  useGetCurrent,
  useGetCurrentKey,
  useGetOneUserById,
  useGetOneUserByIdKey,
  useFindManyKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { isSsoLinkedUser } from '../../../components/userNameForm/isSsoLinkedUser';
import { UserNameFormView } from '../../../components/userNameForm/UserNameFormView';
import { useUserNameFields } from '../../../components/userNameForm/useUserNameFields';
import de from '../../../components/userNameForm/de.json';
import en from '../../../components/userNameForm/en.json';

/** Account settings → Profile: change the own first and last name. Read-only for SSO users. */
export function NameForm() {
  const { t } = useTranslations({ en, de });
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToastMessage();

  const { data: me, isLoading: isLoadingMe } = useGetCurrent();
  const { data: details } = useGetOneUserById({ path: { id: me?.id ?? 0 } }, undefined, { enabled: !!me });
  const { firstName, setFirstName, lastName, setLastName } = useUserNameFields(me);

  const { mutate, isPending } = useChangeMyName(undefined, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [useGetCurrentKey] });
      queryClient.invalidateQueries({ queryKey: [useGetOneUserByIdKey] });
      queryClient.invalidateQueries({ queryKey: [useFindManyKey] });
      showSuccess({ title: t('updated') });
    },
    onError: (error) => {
      const body = error instanceof ApiError ? (error.body as { message?: string | string[] } | undefined) : undefined;
      const message = Array.isArray(body?.message) ? body?.message[0] : body?.message;
      showError({ title: typeof message === 'string' && message.trim() ? message : t('updateFailed') });
    },
  });

  const onSubmit = useCallback(() => {
    mutate({ body: { firstName: firstName.trim() || null, lastName: lastName.trim() || null } });
  }, [mutate, firstName, lastName]);

  return (
    <UserNameFormView
      firstName={firstName}
      lastName={lastName}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onSubmit={onSubmit}
      isLoading={isLoadingMe}
      isPending={isPending}
      isSsoManaged={isSsoLinkedUser(details)}
    />
  );
}
