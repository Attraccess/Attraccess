// Connections viewer for the MQTT server detail slot (ATT-523): the broker's
// live client connections, with force-close for the manage tier.
import {
  Button,
  EmptyState,
  StatusAlert,
  StatusDialog,
  TableDataLoadingIndicator,
} from '@attraccess/plugins-frontend-ui';
import {
  Card,
  Chip,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { PlugZapIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { formatBytes, formatNumber, formatRate, formatTimestamp } from '../format';
import { useRabbitmqTranslations } from '../i18n';
import { usePolledResource } from '../usePolledResource';
import { closeConnection, fetchConnections, type RabbitmqConnection } from './connections-api';

export const CONNECTIONS_POLL_INTERVAL_MS = 10_000;

export function RabbitmqConnectionsPanel({ mqttServerId, canManage }: { mqttServerId: number; canManage: boolean }) {
  const { t, language } = useRabbitmqTranslations();
  const { data, error, loading, reload } = usePolledResource(
    () => fetchConnections(mqttServerId),
    CONNECTIONS_POLL_INTERVAL_MS,
    t('connections.loadError'),
  );
  const [target, setTarget] = useState<RabbitmqConnection | null>(null);
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const dismiss = () => {
    setTarget(null);
    setReason('');
    setCloseError(null);
  };

  const confirmClose = async () => {
    if (!target) return;
    setClosing(true);
    setCloseError(null);
    try {
      await closeConnection(mqttServerId, target.name, reason);
      dismiss();
      void reload();
    } catch (err) {
      setCloseError(err instanceof Error && err.message ? err.message : t('connections.closeError'));
      // The client may be gone already (or the broker changed): show the current list behind the dialog.
      void reload();
    } finally {
      setClosing(false);
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
          <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">{t('connections.title')}</p>
          {data && (
            <Chip size="sm" variant="soft">
              {data.total}
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
          <StatusAlert status="warning">{t('connections.truncated', { total: data.total })}</StatusAlert>
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
                  <TableColumn>{t('connections.state')}</TableColumn>
                  <TableColumn>{t('connections.connectedSince')}</TableColumn>
                  <TableColumn>{t('connections.channels')}</TableColumn>
                  <TableColumn>{t('connections.traffic')}</TableColumn>
                  {canManage && <TableColumn>{t('users.actions')}</TableColumn>}
                </TableHeader>
                <TableBody items={data.connections}>
                  {(connection) => (
                    <TableRow key={connection.name} id={connection.name}>
                      <TableCell className="rmq:font-medium rmq:whitespace-nowrap" title={connection.name}>
                        {connection.clientId ?? connection.name}
                      </TableCell>
                      <TableCell>{connection.user ?? '–'}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap">
                        {connection.peerHost ? `${connection.peerHost}:${connection.peerPort ?? ''}` : '–'}
                      </TableCell>
                      <TableCell className="rmq:whitespace-nowrap">{connection.protocol ?? '–'}</TableCell>
                      <TableCell>{connection.state ?? '–'}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap">
                        {formatTimestamp(connection.connectedAt, language)}
                      </TableCell>
                      <TableCell>{formatNumber(connection.channels, language)}</TableCell>
                      <TableCell className="rmq:whitespace-nowrap rmq:text-xs">
                        ↓ {formatBytes(connection.recvBytes)} ({formatRate(connection.recvRate, 'B/s')})
                        <br />↑ {formatBytes(connection.sendBytes)} ({formatRate(connection.sendRate, 'B/s')})
                      </TableCell>
                      {canManage && (
                        <TableCell>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="ghost"
                            aria-label={t('connections.close', { name: connection.clientId ?? connection.name })}
                            onPress={() => setTarget(connection)}
                            data-cy="rabbitmq-connection-close-button"
                          >
                            <XIcon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
                          </Button>
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

      <StatusDialog
        isOpen={target !== null}
        onClose={dismiss}
        status="error"
        title={t('connections.closeTitle')}
        action={{
          label: t('connections.closeConfirm'),
          onPress: confirmClose,
          isPending: closing,
          'data-cy': 'rabbitmq-connection-close-confirm-button',
        }}
        closeLabel={t('common.cancel')}
        data-cy={`rabbitmq-connection-close-modal-${mqttServerId}`}
      >
        <div className="rmq:flex rmq:flex-col rmq:gap-3">
          <p>{t('connections.closeDescription', { name: target?.clientId ?? target?.name ?? '' })}</p>
          <TextField value={reason} onChange={setReason} className="rmq:w-full">
            <Label>{t('connections.reason')}</Label>
            <Input autoComplete="off" data-cy="rabbitmq-connection-close-reason-input" />
          </TextField>
          {closeError && (
            <StatusAlert status="danger" title={t('connections.closeError')} data-cy="rabbitmq-connection-close-error">
              {closeError === t('connections.closeError') ? undefined : closeError}
            </StatusAlert>
          )}
        </div>
      </StatusDialog>
    </Card>
  );
}
