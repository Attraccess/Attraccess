import { useEffect, useState } from 'react';

/** The editable first and last name of a loaded user; blank fields are sent as null by the API. */
export function useUserNameFields(user: { firstName: string | null; lastName: string | null } | undefined) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const loaded = user !== undefined;
  const storedFirstName = user?.firstName ?? '';
  const storedLastName = user?.lastName ?? '';
  // Reset only when the stored names change: a background refetch with the same names keeps unsaved typing.
  useEffect(() => {
    if (loaded) {
      setFirstName(storedFirstName);
      setLastName(storedLastName);
    }
  }, [loaded, storedFirstName, storedLastName]);

  return { firstName, setFirstName, lastName, setLastName };
}
