import {
  Alert,
  AlertContent,
  AlertDescription,
  Button,
  Card,
  Spinner,
} from '@heroui/react';
import { RabbitIcon, ServerIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RabbitmqConnectionsPanel } from './RabbitmqConnectionsPanel';
import { RabbitmqStatusPanel } from './RabbitmqStatusPanel';

interface MqttServerSummary {
  readonly id: number;
  readonly name: string;
  readonly host: string;
  readonly port: number;
}

export function selectRabbitmqServerId(
  servers: readonly Pick<MqttServerSummary, 'id'>[],
  currentServerId: number | null
): number | null {
  if (currentServerId !== null && servers.some((server) => server.id === currentServerId)) {
    return currentServerId;
  }
  return servers[0]?.id ?? null;
}

async function fetchMqttServers(): Promise<MqttServerSummary[]> {
  const res = await fetch('/api/mqtt/servers', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as MqttServerSummary[];
}

export function RabbitmqPage() {
  const [servers, setServers] = useState<MqttServerSummary[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMqttServers()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setServers(data);
        setSelectedServerId((current) => selectRabbitmqServerId(data, current));
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedServer = servers.find((server) => server.id === selectedServerId) ?? null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto" data-cy="rabbitmq-page">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <RabbitIcon className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold text-default-800">RabbitMQ</h1>
            <p className="text-sm text-default-500">
              Management status and live client connections for RabbitMQ-backed MQTT servers.
            </p>
          </div>
        </div>
      </div>

      <Card className="border border-default-200 dark:border-default-100">
        <Card.Header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ServerIcon className="w-5 h-5 text-primary" />
            <p className="text-base font-semibold text-default-700">MQTT server</p>
          </div>
          {servers.length > 0 && (
            <select
              className="min-w-64 rounded-md border border-default-200 bg-content1 px-3 py-2 text-sm text-default-700 outline-none focus:border-primary"
              value={selectedServerId ?? ''}
              onChange={(event) => setSelectedServerId(Number(event.target.value))}
              data-cy="rabbitmq-page-server-select"
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.host}:{server.port})
                </option>
              ))}
            </select>
          )}
        </Card.Header>
        <Card.Content>
          {loading && (
            <div className="flex items-center justify-center p-6">
              <Spinner color="accent" data-cy="rabbitmq-page-loading-spinner" />
            </div>
          )}

          {error && (
            <Alert status="danger" data-cy="rabbitmq-page-error-alert">
              <AlertContent>
                <AlertDescription>Failed to load MQTT servers: {error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          {!loading && !error && servers.length === 0 && (
            <div className="rounded-lg border border-dashed border-default-200 p-6 text-center text-sm text-default-500">
              No MQTT servers are configured yet.
            </div>
          )}

          {!loading && !error && selectedServer && (
            <div className="flex flex-col gap-2 text-sm text-default-600">
              <span className="font-medium text-default-700">{selectedServer.name}</span>
              <span>
                {selectedServer.host}:{selectedServer.port}
              </span>
            </div>
          )}
        </Card.Content>
      </Card>

      {selectedServerId !== null && (
        <>
          <RabbitmqStatusPanel mqttServerId={selectedServerId} hideWhenNotRabbit={false} />
          <RabbitmqConnectionsPanel mqttServerId={selectedServerId} />
        </>
      )}

      <div className="flex justify-end">
        <Button as="a" href="/mqtt/servers" variant="ghost" data-cy="rabbitmq-page-manage-mqtt-link">
          Manage MQTT servers
        </Button>
      </div>
    </div>
  );
}
