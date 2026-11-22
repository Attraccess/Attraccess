import { useChangeMyName, useGetCurrent, useGetOneUserById } from '@attraccess/react-query-client';
import { useCallback } from 'react';
import { isSsoLinkedUser } from '../../../components/userNameForm/isSsoLinkedUser';
import { UserNameFormView } from '../../../components/userNameForm/UserNameFormView';
import { useUserNameForm } from '../../../components/userNameForm/useUserNameForm';

/** Account settings → Profile: change the own first and last name. Read-only for SSO users. */
export function NameForm() {
  const { data: me, isLoading: isLoadingMe } = useGetCurrent();
  // The sign-in methods, which tell whether SSO manages the name, come only with the user details.
  const { data: details, isPending: isPendingDetails } = useGetOneUserById({ path: { id: me?.id ?? 0 } }, undefined, {
    enabled: !!me,
  });
  const { firstName, setFirstName, lastName, setLastName, body, mutationOptions } = useUserNameForm(me);

  const { mutate, isPending } = useChangeMyName(undefined, mutationOptions);

  const onSubmit = useCallback(() => {
    mutate({ body });
  }, [mutate, body]);

  return (
    <UserNameFormView
      firstName={firstName}
      lastName={lastName}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onSubmit={onSubmit}
      // Stay loading until the details tell whether SSO manages the name, so SSO users never see an editable form.
      isLoading={isLoadingMe || (!!me && isPendingDetails)}
      isPending={isPending}
      isSsoManaged={isSsoLinkedUser(details)}
    />
  );
}
