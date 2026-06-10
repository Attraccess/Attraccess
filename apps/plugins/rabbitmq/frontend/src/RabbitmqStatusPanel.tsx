// Connection-status panel for the MQTT server detail slot (ATT-521).
//
// Appears only for MQTT servers detected as RabbitMQ brokers. Shows whether the
// management API is reachable, whether the configured credentials are accepted,
// and the broker / management-plugin versions. No management actions yet —
// status only.
import { Alert, AlertContent, AlertDescription, Button, Card, Chip, Spinner } from '@heroui/react';
import { CheckCircle2Icon, RabbitIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDetection } from './detection';

function StatusRow({ ok, label, value }: { ok: boolean; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2Icon className="w-4 h-4 text-success" />
        ) : (
          <XCircleIcon className="w-4 h-4 text-danger" />
        )}
        <span className="text-sm text-default-600">{label}</span>
      </div>
      <span className="text-sm font-medium text-default-700">{value}</span>
    </div>
  );
}

export function RabbitmqStatusPanel({ mqttServerId }: { mqttServerId: number }) {
  const { result, loading, refresh } = useDetection(mqttServerId);

  // Render nothing for non-RabbitMQ servers (and while the first probe is still
  // running / if detection failed), so the detail view is unchanged unless a
  // RabbitMQ broker is positively detected.
  if (!result?.isRabbitMQ) {
    return null;
  }

  return (
    <Card
      data-cy={`rabbitmq-status-panel-${mqttServerId}`}
      className="w-full border border-default-200 dark:border-default-100"
    >
      <Card.Header className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RabbitIcon className="w-5 h-5 text-primary" />
          <p className="text-base font-semibold text-default-700">RabbitMQ</p>
          <Chip color="accent" variant="soft" size="sm">
            detected
          </Chip>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label="Refresh RabbitMQ status"
          data-cy={`rabbitmq-status-refresh-${mqttServerId}`}
          onPress={refresh}
          isDisabled={loading}
        >
          {loading ? <Spinner size="sm" /> : <RefreshCwIcon className="w-4 h-4" />}
        </Button>
      </Card.Header>
      <Card.Content className="flex flex-col gap-1">
        <StatusRow ok={result.reachable} label="Management API reachable" value={result.reachable ? 'Yes' : 'No'} />
        <StatusRow ok={result.authOk} label="Authentication" value={result.authOk ? 'OK' : 'Failed'} />
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm text-default-600">Management API version</span>
          <span className="text-sm font-medium text-default-700">{result.managementVersion ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm text-default-600">RabbitMQ version</span>
          <span className="text-sm font-medium text-default-700">{result.rabbitmqVersion ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm text-default-600">Management API</span>
          <code className="text-xs text-default-500">{result.managementApi || '—'}</code>
        </div>

        {result.error && (
          <Alert status={result.reachable ? 'warning' : 'danger'} className="mt-2">
            <AlertContent>
              <AlertDescription>{result.error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
