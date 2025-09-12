import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Button,
  Spinner,
  Alert,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/list/en.json';
import de from './translations/list/de.json';
import { useState } from 'react';
import {
  useMqttServiceMqttServersGetAll,
  useMqttServiceMqttServersDeleteOne,
  UseMqttServiceMqttServersGetAllKeyFn,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';

// Define ServerListItem component inline
interface ServerListItemProps {
  id: number;
  name: string;
  host: string;
  port: number;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  t: (key: string) => string;
}

function ServerListItem({ id, name, host, port, onEdit, onDelete, t }: ServerListItemProps) {
  return (
    <div className="border rounded-md p-4 flex justify-between items-center">
      <div>
        <h3 className="font-medium">{name}</h3>
        <p className="text-sm text-gray-500">
          {host}:{port}
        </p>
      </div>
      <div className="space-x-2">
        <Button
          color="secondary"
          variant="flat"
          size="sm"
          onPress={() => onEdit(id)}
          data-cy={`mqtt-server-list-item-edit-button-${id}`}
        >
          {t('editServer')}
        </Button>
        <Button
          color="danger"
          variant="flat"
          size="sm"
          onPress={() => onDelete(id)}
          data-cy={`mqtt-server-list-item-delete-button-${id}`}
        >
          {t('deleteServer')}
        </Button>
      </div>
    </div>
  );
}

export function MqttServerList() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [serverToDelete, setServerToDelete] = useState<number | null>(null);

  // Fetch MQTT servers
  const { data: servers = [], isLoading, error } = useMqttServiceMqttServersGetAll();

  // Delete server mutation
  const deleteServer = useMqttServiceMqttServersDeleteOne({
    onSuccess: () => {
      success({
        title: t('serverDeleted'),
        description: t('serverDeletedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [UseMqttServiceMqttServersGetAllKeyFn()[0]],
      });
      onClose();
    },
    onError: (err) => {
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? err.message : t('failedToDelete'),
      });
    },
  });

  const handleEditServer = (serverId: number) => {
    navigate(`/mqtt/servers/${serverId}`);
  };

  const handleDeleteServer = (serverId: number) => {
    setServerToDelete(serverId);
    onOpen();
  };

  const confirmDelete = async () => {
    if (serverToDelete) {
      deleteServer.mutate({ id: serverToDelete });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner size="lg" color="primary" data-cy="mqtt-server-list-loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert color="danger" data-cy="mqtt-server-list-error-alert">
        {t('errorLoading')}
      </Alert>
    );
  }

  if (servers.length === 0) {
    return (
      <Alert color="warning" data-cy="mqtt-server-list-no-servers-alert">
        {t('noServersConfigured')}
      </Alert>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {servers.map((server) => (
          <ServerListItem
            key={`mqtt-server-${server.id}`}
            id={server.id}
            name={server.name}
            host={server.host}
            port={server.port}
            onEdit={handleEditServer}
            onDelete={handleDeleteServer}
            t={t}
          />
        ))}
      </div>

      <Modal isOpen={isOpen} onClose={onClose} data-cy="mqtt-server-list-delete-confirmation-modal">
        <ModalContent>
          <ModalHeader>{t('deleteServer')}</ModalHeader>
          <ModalBody>
            <p>{t('deleteConfirmation')}</p>
          </ModalBody>
          <ModalFooter>
            <Button
              color="default"
              variant="flat"
              onPress={onClose}
              data-cy="mqtt-server-list-delete-confirmation-cancel-button"
            >
              {t('cancel')}
            </Button>
            <Button
              color="danger"
              onPress={confirmDelete}
              isLoading={deleteServer.isPending}
              data-cy="mqtt-server-list-delete-confirmation-delete-button"
            >
              {t('deleteServer')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
