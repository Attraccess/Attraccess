import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  useOverlayState,
} from '@heroui/react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../../../components/button';
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
import { AlertStatusIcon } from '../../../components/AlertStatusIcon';
import { EmptyState } from '../../../components/emptyState';
import { PluginSlot } from '../../plugins/PluginSlot';
import { MQTT_SERVER_LIST_ROW_SLOT, MqttServerSlotContext } from '../mqtt.slots';

export function MqttServerList() {
  const { t } = useTranslations({ en, de });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();
  const { isOpen, open, close: closeDeleteModal } = useOverlayState();
  const [serverToDelete, setServerToDelete] = useState<number | null>(null);

  const { data: servers = [], isLoading, error } = useMqttServiceMqttServersGetAll();

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
        <AlertStatusIcon status="danger" />
        <AlertContent>
          <AlertDescription>{t('errorLoading')}</AlertDescription>
        </AlertContent>
      </Alert>
    );
  }

  return (
    <>
      <Table data-cy="mqtt-server-list-table">
        <TableScrollContainer>
          <TableContent aria-label={t('tableLabel')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('columnName')}</TableColumn>
              <TableColumn>{t('columnAddress')}</TableColumn>
              <TableColumn>{t('columnActions')}</TableColumn>
            </TableHeader>
            <TableBody
              items={servers}
              renderEmptyState={() => <EmptyState message={t('noServersConfigured')} />}
            >
              {(server) => (
                <TableRow key={`mqtt-server-${server.id}`} id={server.id}>
                  <TableCell>{server.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {server.host}:{server.port}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-row gap-2">
                      <Button
                        variant="ghost"
                        onPress={() => handleEditServer(server.id)}
                        data-cy={`mqtt-server-list-item-edit-button-${server.id}`}
                      >
                        <PencilIcon className="w-4 h-4" />
                        {t('editServer')}
                      </Button>
                      <Button
                        variant="danger-soft"
                        onPress={() => handleDeleteServer(server.id)}
                        data-cy={`mqtt-server-list-item-delete-button-${server.id}`}
                      >
                        <Trash2Icon className="w-4 h-4" />
                        {t('deleteServer')}
                      </Button>
                      <PluginSlot<MqttServerSlotContext>
                        slotId={MQTT_SERVER_LIST_ROW_SLOT}
                        context={{ mqttServerId: server.id }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>

      <Modal
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) closeDeleteModal();
        }}
        data-cy="mqtt-server-list-delete-confirmation-modal"
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
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
