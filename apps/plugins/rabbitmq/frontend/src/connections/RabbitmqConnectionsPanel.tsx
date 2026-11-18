// Connections viewer for the MQTT server detail slot (ATT-523): the broker's
// live client connections, with force-close for the manage tier.
import {
  Button,
  EmptyState,
  StatusAlert,
  TableActionsColumnHeader,
  TableDataLoadingIndicator,
  TableRowActions,
} from '@attraccess/plugins-frontend-ui';
import {
  Card,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { PlugZapIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { useRef } from 'react';
import { MISSING_VALUE, useRabbitmqFormatters } from '../useRabbitmqFormatters';
import { useRabbitmqTranslations } from '../i18n';
import { usePolledResource } from '../usePolledResource';
import {
  RabbitmqConnectionCloseMessage,
  type RabbitmqConnectionCloseMessageHandle,
} from './RabbitmqConnectionCloseMessage';
import { closeConnection, fetchConnections, type RabbitmqConnection } from './connections-api';

export const CONNECTIONS_POLL_INTERVAL_MS = 10_000;

export function RabbitmqConnectionsPanel({ mqttServerId, canManage }: { mqttServerId: number; canManage: boolean }) {
  const { t } = useRabbitmqTranslations();
  const format = useRabbitmqFormatters();
  const { data, error, loading, reload } = usePolledResource(
    () => fetchConnections(mqttServerId),
    CONNECTIONS_POLL_INTERVAL_MS,
    t('connections.loadError'),
  );
  const closeMessage = useRef<RabbitmqConnectionCloseMessageHandle>(null);

  const confirmClose = async (connection: RabbitmqConnection) => {
    const message = closeMessage.current;
    message?.showError(null);
    try {
      await closeConnection(mqttServerId, connection.name, message?.reason ?? '');
      void reload();
    } catch (err) {
      message?.showError(err instanceof Error && err.message ? err.message : t('connections.closeError'));
      // The client may be gone already (or the broker changed): show the current list behind the dialog.
      void reload();
      throw err;
    }
  };

  return (
    <Card
      data-cy={`rabbitmq-connections-panel-${mqttServerId}`}
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
        <div className="rmq:flex rmq:items-center rmq:gap-2">
          <PlugZapIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
          <h3 className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('connections.title')}</h3>
          {data && (
            <Chip size="sm" variant="soft">
              {format.number(data.total)}
            </Chip>
          )}
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={t('connections.reload')}
          onPress={() => void reload()}
          isPending={loading}
          data-cy={`rabbitmq-connections-reload-${mqttServerId}`}
        >
          <RefreshCwIcon className="rmq:w-4 rmq:h-4" />
        </Button>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-3">
        {error && (
          <StatusAlert status="danger" title={t('connections.loadError')} data-cy="rabbitmq-connections-error-alert">
            {error === t('connections.loadError') ? undefined : error}
          </StatusAlert>
        )}
        {!data && !error && <TableDataLoadingIndicator />}
        {data && data.connections.length === 0 && <EmptyState message={t('connections.empty')} />}
        {data && data.truncated && (
          <StatusAlert status="warning">
            {t('connections.truncated', {
              shown: format.number(data.connections.length),
              total: format.number(data.total),
            })}
          </StatusAlert>
        )}
        {data && data.connections.length > 0 && (
          <Table data-cy="rabbitmq-connections-table">
            <TableScrollContainer>
              <TableContent aria-label={t('connections.title')}>
                <TableHeader>
                  <TableColumn isRowHeader>{t('connections.client')}</TableColumn>
                  <TableColumn>{t('connections.user')}</TableColumn>
                  <TableColumn>{t('connections.peer')}</TableColumn>
                  <TableColumn>{t('connections.protocol')}</TableColumn>
                  <TableColumn>{t('common.state')}</TableColumn>
                  <TableColumn>{t('connections.connectedSince')}</TableColumn>
                  <TableColumn>{t('connections.channels')}</TableColumn>
                  <TableColumn>{t('connections.traffic')}</TableColumn>
                  {canManage && (
                    <TableColumn id="actions">
                      <TableActionsColumnHeader />
                    </TableColumn>
                  )}
                </TableHeader>
                <TableBody items={data.connections}>
                  {(connection) => (
                    <TableRow key={connection.name} id={connection.name}>
                      <TableCell className="rmq:font-medium rmq:whitespace-nowrap">
                        <span title={connection.name}>{connection.clientId ?? connection.name}</span>
                      </TableCell>
                      <TableCell>{connection.user ?? MISSING_VALUE}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap">
                        {connection.peerHost ? `${connection.peerHost}:${connection.peerPort ?? ''}` : MISSING_VALUE}
                      </TableCell>
                      <TableCell className="rmq:whitespace-nowrap">{connection.protocol ?? MISSING_VALUE}</TableCell>
                      <TableCell>{connection.state ?? MISSING_VALUE}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap">{format.dateTime(connection.connectedAt)}</TableCell>
                      <TableCell>{format.number(connection.channels)}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap rmq:text-xs">
                        <span aria-hidden>↓ </span>
                        <span className="rmq:sr-only">{t('connections.received')}: </span>
                        {format.bytes(connection.recvBytes)} ({format.rate(connection.recvRate, 'B/s')})
                        <br />
                        <span aria-hidden>↑ </span>
                        <span className="rmq:sr-only">{t('connections.sent')}: </span>
                        {format.bytes(connection.sendBytes)} ({format.rate(connection.sendRate, 'B/s')})
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <TableRowActions
                            itemName={connection.clientId ?? connection.name}
                            actions={[
                              {
                                key: 'close',
                                label: t('connections.closeTitle'),
                                icon: UnplugIcon,
                                tone: 'danger',
                                onPress: () => confirmClose(connection),
                                'data-cy': `rabbitmq-connection-close-button-${connection.name}`,
                                confirm: {
                                  title: t('connections.closeTitle'),
                                  message: (
                                    <RabbitmqConnectionCloseMessage
                                      name={connection.clientId ?? connection.name}
                                      ref={closeMessage}
                                    />
                                  ),
                                  confirmLabel: t('connections.closeConfirm'),
                                  cancelLabel: t('common.cancel'),
                                  'data-cy': `rabbitmq-connection-close-modal-${mqttServerId}`,
                                  confirmDataCy: 'rabbitmq-connection-close-confirm-button',
                                },
                              },
                            ]}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        )}
      </Card.Content>
    </Card>
  );
}
