// Live connections viewer for the MQTT server detail slot (ATT-523).
//
// Lists currently connected clients via the RabbitMQ management API. Polls
// every few seconds while mounted and supports manual refresh and force-close.
import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Card,
  Chip,
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
import { PlugIcon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { useState } from 'react';
import type { RabbitmqConnection } from './connections';
import { useConnections } from './connections';
import { useDetection } from './detection';

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRate(rate: number | null): string {
  if (rate === null) {
    return '—';
  }
  return `${formatBytes(rate)}/s`;
}

function formatPeer(host: string | null, port: number | null): string {
  if (!host) {
    return '—';
  }
  return port !== null ? `${host}:${port}` : host;
}

function formatConnectedAt(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function connectionKey(conn: RabbitmqConnection): string {
  return conn.name || `${conn.clientId ?? 'unknown'}-${conn.peerHost ?? 'local'}`;
}

export function RabbitmqConnectionsPanel({ mqttServerId }: { mqttServerId: number }) {
  const { result: detection } = useDetection(mqttServerId);
  const { result, loading, error, refresh, close, closing } = useConnections(mqttServerId);
  const { isOpen, open, close: closeModal } = useOverlayState();
  const [connectionToClose, setConnectionToClose] = useState<RabbitmqConnection | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (!detection?.isRabbitMQ || !detection.authOk) {
    return null;
  }

  const connections = result?.connections ?? [];
  const count = connections.length;

  const handleCloseRequest = (conn: RabbitmqConnection) => {
    setConnectionToClose(conn);
    setCloseError(null);
    open();
  };

  const confirmClose = async () => {
    if (!connectionToClose) {
      return;
    }
    setCloseError(null);
    try {
      const closeResult = await close(connectionToClose.name);
      if (!closeResult.closed) {
        setCloseError(closeResult.error ?? 'Failed to close connection.');
        return;
      }
      closeModal();
      setConnectionToClose(null);
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Failed to close connection.');
    }
  };

  return (
    <>
      <Card
        data-cy={`rabbitmq-connections-panel-${mqttServerId}`}
        className="w-full border border-default-200 dark:border-default-100"
      >
        <Card.Header className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <PlugIcon className="w-5 h-5 text-primary" />
            <p className="text-base font-semibold text-default-700">Connections</p>
            <Chip color="default" variant="soft" size="sm">
              {count} connected
            </Chip>
          </div>
          <div className="flex items-center gap-2">
            {result?.checkedAt && (
              <span className="text-xs text-default-400 hidden sm:inline">
                Updated {formatConnectedAt(result.checkedAt)}
              </span>
            )}
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Refresh connections"
              data-cy={`rabbitmq-connections-refresh-${mqttServerId}`}
              onPress={refresh}
              isDisabled={loading}
            >
              {loading ? <Spinner size="sm" /> : <RefreshCwIcon className="w-4 h-4" />}
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          {(error || (result && !result.ok && result.error)) && (
            <Alert status="danger">
              <AlertContent>
                <AlertDescription>{error ?? result?.error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          <Table data-cy={`rabbitmq-connections-table-${mqttServerId}`}>
            <TableScrollContainer>
              <TableContent aria-label="RabbitMQ connections">
                <TableHeader>
                  <TableColumn isRowHeader>Client ID</TableColumn>
                  <TableColumn>User</TableColumn>
                  <TableColumn>Peer</TableColumn>
                  <TableColumn>Protocol</TableColumn>
                  <TableColumn>State</TableColumn>
                  <TableColumn>Connected</TableColumn>
                  <TableColumn>Traffic</TableColumn>
                  <TableColumn>Actions</TableColumn>
                </TableHeader>
                <TableBody
                  items={connections}
                  renderEmptyState={() => (
                    <div className="py-6 text-center text-sm text-default-500">No active connections.</div>
                  )}
                >
                  {(conn) => (
                    <TableRow key={connectionKey(conn)} id={connectionKey(conn)}>
                      <TableCell className="max-w-[10rem] truncate" title={conn.clientId ?? undefined}>
                        {conn.clientId ?? '—'}
                      </TableCell>
                      <TableCell>{conn.user ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatPeer(conn.peerHost, conn.peerPort)}
                        {conn.ssl && (
                          <Chip color="success" variant="soft" size="sm" className="ml-1">
                            TLS
                          </Chip>
                        )}
                      </TableCell>
                      <TableCell>{conn.protocol ?? '—'}</TableCell>
                      <TableCell>
                        <Chip
                          color={conn.state === 'running' ? 'success' : 'warning'}
                          variant="soft"
                          size="sm"
                        >
                          {conn.state ?? '—'}
                        </Chip>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatConnectedAt(conn.connectedAt)}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        <div>↓ {formatBytes(conn.recvBytes)} ({formatRate(conn.recvRate)})</div>
                        <div>↑ {formatBytes(conn.sendBytes)} ({formatRate(conn.sendRate)})</div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          data-cy={`rabbitmq-connections-close-${mqttServerId}-${encodeURIComponent(conn.name)}`}
                          onPress={() => handleCloseRequest(conn)}
                          isDisabled={closing === conn.name}
                        >
                          <UnplugIcon className="w-4 h-4" />
                          Close
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </TableContent>
            </TableScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <Modal
        isOpen={isOpen}
        onOpenChange={(o) => {
          if (!o) {
            closeModal();
            setConnectionToClose(null);
            setCloseError(null);
          }
        }}
        data-cy={`rabbitmq-connections-close-modal-${mqttServerId}`}
      >
        <ModalBackdrop>
          <ModalContainer size="sm">
            <ModalDialog>
              {({ close: dismiss }) => (
                <>
                  <ModalHeader>
                    <ModalHeading>Close connection</ModalHeading>
                  </ModalHeader>
                  <ModalBody className="flex flex-col gap-2">
                    <p className="text-sm text-default-600">
                      Force-close this client connection? The client will need to reconnect.
                    </p>
                    {connectionToClose && (
                      <div className="rounded-md bg-default-100 p-3 text-xs font-mono text-default-600 break-all">
                        {connectionToClose.name}
                      </div>
                    )}
                    {closeError && (
                      <Alert status="danger">
                        <AlertContent>
                          <AlertDescription>{closeError}</AlertDescription>
                        </AlertContent>
                      </Alert>
                    )}
                  </ModalBody>
                  <ModalFooter>
                    <Button
                      variant="secondary"
                      onPress={() => {
                        dismiss();
                        setConnectionToClose(null);
                        setCloseError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onPress={confirmClose}
                      isDisabled={!connectionToClose || closing === connectionToClose.name}
                    >
                      {closing === connectionToClose?.name ? <Spinner size="sm" /> : 'Close connection'}
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
