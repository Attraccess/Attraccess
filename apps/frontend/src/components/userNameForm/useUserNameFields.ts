import { useEffect, useState } from 'react';

/** The editable first and last name of a loaded user; blank fields are sent as null by the API. */
export function useUserNameFields(user: { firstName: string | null; lastName: string | null } | undefined) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
    }
  }, [user]);

  return { firstName, setFirstName, lastName, setLastName };
}
