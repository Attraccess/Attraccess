import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIndicator,
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  useOverlayState,
} from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/list/en.json';
import de from './translations/list/de.json';
import { useState } from 'react';
import {
  useMqttServiceMqttServersGetAll,
  useMqttServiceMqttServersDeleteOne,
  useMqttServiceMqttServersGetAllKey,
} from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircleIcon, AlertTriangleIcon } from 'lucide-react';

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
        <Button variant="secondary" onPress={() => onEdit(id)} data-cy={`mqtt-server-list-item-edit-button-${id}`}>
          {t('editServer')}
        </Button>
        <Button
          variant="danger-soft"
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
  const { isOpen, open, close: closeDeleteModal } = useOverlayState();
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
        queryKey: [useMqttServiceMqttServersGetAllKey],
      });
      closeDeleteModal();
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
    open();
  };

  const confirmDelete = async () => {
    if (serverToDelete) {
      deleteServer.mutate({ id: serverToDelete });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner color="accent" data-cy="mqtt-server-list-loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert status="danger" data-cy="mqtt-server-list-error-alert">
        <AlertIndicator>
          <AlertCircleIcon />
        </AlertIndicator>
        <AlertContent>
          <AlertDescription>{t('errorLoading')}</AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  if (servers.length === 0) {
    return (
      <Alert status="warning" data-cy="mqtt-server-list-no-servers-alert">
        <AlertIndicator>
          <AlertTriangleIcon />
        </AlertIndicator>
        <AlertContent>
          <AlertDescription>{t('noServersConfigured')}</AlertDescription>
        </AlertContent>
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

      <Modal
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) closeDeleteModal();
        }}
        data-cy="mqtt-server-list-delete-confirmation-modal"
      >
        <ModalBackdrop>
          <ModalContainer>
            <ModalDialog>
              {({ close }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>{t('deleteServer')}</ModalHeading>
                  </ModalHeader>
                  <ModalBody>
                    <p>{t('deleteConfirmation')}</p>
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant="secondary"
                      onPress={close}
                      data-cy="mqtt-server-list-delete-confirmation-cancel-button"
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      variant="danger"
                      onPress={confirmDelete}
                      isPending={deleteServer.isPending}
                      data-cy="mqtt-server-list-delete-confirmation-delete-button"
                    >
                      {t('deleteServer')}
                    </Button>
                  </ModalFooter>
                </>
              )}
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </>
  );
}
