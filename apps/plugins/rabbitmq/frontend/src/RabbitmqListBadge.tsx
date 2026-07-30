// Per-row badge for the MQTT server list slot (ATT-521).
//
// Renders a "RabbitMQ" chip only when the row's MQTT server is detected as a
// RabbitMQ broker; for anything else it renders nothing, so non-RabbitMQ rows
// are visually unchanged.
import { Chip } from '@heroui/react';
import { RabbitIcon } from 'lucide-react';
import { useDetection } from './detection';

export function RabbitmqListBadge({ mqttServerId }: { mqttServerId: number }) {
  const { result } = useDetection(mqttServerId);

  // Stay invisible until we have a positive RabbitMQ verdict — no spinner, no
  // placeholder, so the list looks identical for non-RabbitMQ servers.
  if (!result?.isRabbitMQ) {
    return null;
  }

  return (
    <Chip data-cy={`rabbitmq-list-badge-${mqttServerId}`} color="accent" variant="soft" size="sm">
      <RabbitIcon className="rmq:w-3.5 rmq:h-3.5" />
      RabbitMQ
    </Chip>
  );
}
