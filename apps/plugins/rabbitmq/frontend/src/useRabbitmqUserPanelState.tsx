import { useCallback, useEffect, useRef, useState } from 'react';
import { useDetection } from './detection';
import { fetchUsers, type RabbitmqUser, type RabbitmqUserList, deleteUser } from './users-api';
import { useRabbitmqTranslations } from './i18n';
import type { TranslationMessage } from '@attraccess/plugins-frontend-ui';
export function useRabbitmqUserPanelState({ mqttServerId }: { mqttServerId: number }) {
  const { t, tMessage, language } = useRabbitmqTranslations();
  const { result } = useDetection(mqttServerId);

  const [data, setData] = useState<RabbitmqUserList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | TranslationMessage | null>(null);

  // Modal state. `formUser` doubles as the mode flag (null = create).
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<RabbitmqUser | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<RabbitmqUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<RabbitmqUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | TranslationMessage | null>(null);

  // The panel can unmount while a fetch is in flight (navigation away) — drop
  // the result instead of calling setState on an unmounted component.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const confirmDelete = async () => {
    if (!userToDelete) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(mqttServerId, userToDelete.name);
      setUserToDelete(null);
      void reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : { key: 'users.deleteError' });
    } finally {
      setDeleting(false);
    }
  };

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchUsers(mqttServerId);
      if (mounted.current) {
        setData(list);
        // Keep the permissions modal's user in sync after edits.
        setPermissionsUser((current) =>
          current ? (list.users.find((user) => user.name === current.name) ?? current) : null,
        );
      }
    } catch (err) {
      if (mounted.current) {
        setLoadError(err instanceof Error ? err.message : { key: 'users.loadError' });
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [mqttServerId]);

  const manageable = result?.isRabbitMQ === true && result.authOk;

  useEffect(() => {
    if (manageable) {
      void reload();
    }
  }, [manageable, reload]);
  return {
    t,
    tMessage,
    language,
    data,
    loading,
    loadError,
    formOpen,
    setFormOpen,
    formUser,
    setFormUser,
    permissionsUser,
    setPermissionsUser,
    userToDelete,
    setUserToDelete,
    deleting,
    setDeleting,
    deleteError,
    setDeleteError,
    reload,
    manageable,
    mqttServerId,
    confirmDelete,
  } as const;
}
