import {
  AlertStatusIcon,
  EmptyState,
  TableActionsColumnHeader,
  TableRowActions,
  useTranslations,
} from '@attraccess/plugins-frontend-ui';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToastMessage } from '../../../components/toastProvider';
import en from './translations/list/en.json';
import de from './translations/list/de.json';
import { useMqttServersGetAll, useMqttServersDeleteOne, useMqttServersGetAllKey } from '@attraccess/react-query-client';
import { useQueryClient } from '@tanstack/react-query';
import { PluginSlot } from '../../plugins/PluginSlot';
import { MQTT_SERVER_LIST_ROW_SLOT, MqttServerSlotContext } from '../mqtt.slots';

export function MqttServerList() {
  // React escapes the output; escaping names again would show `A &amp; B` in confirmations.
  const { t } = useTranslations({ en, de }, { escapeValues: false });
  const navigate = useNavigate();
  const { success, error: showError } = useToastMessage();
  const queryClient = useQueryClient();

  const { data: servers = [], isLoading, error } = useMqttServersGetAll();

  const deleteServer = useMqttServersDeleteOne(undefined, {
    onSuccess: () => {
      success({
        title: t('serverDeleted'),
        description: t('serverDeletedDesc'),
      });
      queryClient.invalidateQueries({
        queryKey: [useMqttServersGetAllKey],
      });
    },
    onError: (err) => {
      showError({
        title: t('errorGeneric'),
        description: err instanceof Error ? err.message : t('failedToDelete'),
      });
    },
  });

  const handleEditServer = (serverId: number) => {
    navigate(`/devices/mqtt/servers/${serverId}`);
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
    <Table data-cy="mqtt-server-list-table">
      <TableScrollContainer>
        <TableContent aria-label={t('tableLabel')}>
          <TableHeader>
            <TableColumn isRowHeader>{t('columnName')}</TableColumn>
            <TableColumn>{t('columnAddress')}</TableColumn>
            <TableColumn>
              <TableActionsColumnHeader />
            </TableColumn>
          </TableHeader>
          <TableBody items={servers} renderEmptyState={() => <EmptyState message={t('noServersConfigured')} />}>
            {(server) => (
              <TableRow key={`mqtt-server-${server.id}`} id={server.id}>
                <TableCell>
                  <div className="flex flex-row items-center gap-2">
                    {server.name}
                    <PluginSlot<MqttServerSlotContext>
                      slotId={MQTT_SERVER_LIST_ROW_SLOT}
                      context={{ mqttServerId: server.id }}
                    />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {server.host}:{server.port}
                </TableCell>
                <TableCell>
                  <TableRowActions
                    itemName={server.name}
                    actions={[
                      {
                        key: 'edit',
                        label: t('editServer'),
                        icon: PencilIcon,
                        onPress: () => handleEditServer(server.id),
                        'data-cy': `mqtt-server-list-item-edit-button-${server.id}`,
                      },
                      {
                        key: 'delete',
                        label: t('deleteServer'),
                        icon: Trash2Icon,
                        tone: 'danger',
                        onPress: () => deleteServer.mutateAsync({ path: { id: server.id } }),
                        confirm: {
                          title: t('deleteConfirmTitle', { name: server.name }),
                          message: t('deleteConfirmation', { name: server.name }),
                          cancelLabel: t('cancel'),
                          'data-cy': 'mqtt-server-list-delete-confirmation-modal',
                          confirmDataCy: 'mqtt-server-list-delete-confirmation-delete-button',
                          cancelDataCy: 'mqtt-server-list-delete-confirmation-cancel-button',
                        },
                        'data-cy': `mqtt-server-list-item-delete-button-${server.id}`,
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
