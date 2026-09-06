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
    <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-3 rmq:py-1.5">
      <div className="rmq:flex rmq:items-center rmq:gap-2">
        {ok ? (
          <CheckCircle2Icon className="rmq:w-4 rmq:h-4 rmq:text-success" />
        ) : (
          <XCircleIcon className="rmq:w-4 rmq:h-4 rmq:text-danger" />
        )}
        <span className="rmq:text-sm rmq:text-default-600">{label}</span>
      </div>
      <span className="rmq:text-sm rmq:font-medium rmq:text-default-700">{value}</span>
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
      className="rmq:w-full rmq:border rmq:border-default-200 rmq:dark:border-default-100"
    >
      <Card.Header className="rmq:flex rmq:flex-row rmq:items-center rmq:justify-between rmq:gap-2">
        <div className="rmq:flex rmq:items-center rmq:gap-2">
          <RabbitIcon className="rmq:w-5 rmq:h-5 rmq:text-accent-soft-foreground" />
          <p className="rmq:text-base rmq:font-semibold rmq:text-default-700">RabbitMQ</p>
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
          {loading ? <Spinner size="sm" /> : <RefreshCwIcon className="rmq:w-4 rmq:h-4" />}
        </Button>
      </Card.Header>
      <Card.Content className="rmq:flex rmq:flex-col rmq:gap-1">
        <StatusRow ok={result.reachable} label="Management API reachable" value={result.reachable ? 'Yes' : 'No'} />
        <StatusRow ok={result.authOk} label="Authentication" value={result.authOk ? 'OK' : 'Failed'} />
        <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-3 rmq:py-1.5">
          <span className="rmq:text-sm rmq:text-default-600">Management API version</span>
          <span className="rmq:text-sm rmq:font-medium rmq:text-default-700">{result.managementVersion ?? '—'}</span>
        </div>
        <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-3 rmq:py-1.5">
          <span className="rmq:text-sm rmq:text-default-600">RabbitMQ version</span>
          <span className="rmq:text-sm rmq:font-medium rmq:text-default-700">{result.rabbitmqVersion ?? '—'}</span>
        </div>
        <div className="rmq:flex rmq:items-center rmq:justify-between rmq:gap-3 rmq:py-1.5">
          <span className="rmq:text-sm rmq:text-default-600">Management API</span>
          <code className="rmq:text-xs rmq:text-default-500">{result.managementApi || '—'}</code>
        </div>

        {result.error && (
          <Alert status={result.reachable ? 'warning' : 'danger'} className="rmq:mt-2">
            <AlertContent>
              <AlertDescription>{result.error}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </Card.Content>
    </Card>
  );
}
