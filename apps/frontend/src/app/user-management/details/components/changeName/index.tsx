import { useChangeUserName, useGetOneUserById } from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { isSsoLinkedUser } from '../../../../../components/userNameForm/isSsoLinkedUser';
import { UserNameFormView } from '../../../../../components/userNameForm/UserNameFormView';
import { useUserNameForm } from '../../../../../components/userNameForm/useUserNameForm';

interface Props {
  userId: number;
}

/** User management → user → Profile: an administrator changes the first and last name. Read-only for SSO users. */
export function ChangeNameForm({ userId }: Readonly<Props>) {
  const { data: user, isLoading } = useGetOneUserById({ path: { id: userId } });
  const { firstName, setFirstName, lastName, setLastName, body, mutationOptions } = useUserNameForm(user);

  const { mutate, isPending } = useChangeUserName(undefined, mutationOptions);

  const onSubmit = useCallback(() => {
    mutate({ path: { id: userId }, body });
  }, [mutate, userId, body]);

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
