// RabbitMQ management plugin — frontend half.
//
// ATT-526 bootstrapped this remote with one route + sidebar entry. ATT-521 adds
// the MQTT slot contributions: a "RabbitMQ" badge in the MQTT server list and a
// connection-status panel in the MQTT server detail view, both driven by the
// plugin's backend detection endpoint. The host stays RabbitMQ-agnostic — it
// only exposes the generic slots and renders whatever we contribute.
import './styles.css';
import { Card } from '@heroui/react';
import { RabbitIcon } from 'lucide-react';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSidebarItem,
  PluginSlotContribution,
  RouteConfig,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useDetection } from './detection';
import { RabbitmqListBadge } from './RabbitmqListBadge';
import { RabbitmqStatusPanel } from './RabbitmqStatusPanel';
import { RabbitmqUserPanel } from './RabbitmqUserPanel';

// Host slot ids exposed by the MQTT UI. The SDK is vendor-agnostic and does not
// export them, and the host owns them in apps/frontend (which a plugin cannot
// import) — so a plugin restates them, exactly like it restates a route `path`
// it links to. Both slots receive `{ mqttServerId }`.
const MQTT_SERVER_DETAIL_SLOT = 'mqtt.server.detail';
const MQTT_SERVER_LIST_ROW_SLOT = 'mqtt.server.list.row';

// The context shape the host documents for both MQTT slots.
interface MqttServerSlotContext {
  mqttServerId: number;
  [key: string]: unknown;
}

// Everything the plugin contributes to the MQTT server detail view: the
// connection-status panel (ATT-521) plus the user-management panel (ATT-522).
// Returns null (no wrapper element) for non-RabbitMQ servers so the host
// layout is unchanged unless a RabbitMQ broker is positively detected.
function RabbitmqDetailSlot({ mqttServerId }: { mqttServerId: number }) {
  const { result } = useDetection(mqttServerId);

  if (!result?.isRabbitMQ) {
    return null;
  }

  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
      <RabbitmqStatusPanel mqttServerId={mqttServerId} />
      <RabbitmqUserPanel mqttServerId={mqttServerId} />
    </div>
  );
}

function RabbitmqPage() {
  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-6 rmq:p-6 rmq:max-w-4xl rmq:mx-auto">
      <div className="rmq:flex rmq:items-center rmq:gap-3">
        <RabbitIcon className="rmq:w-6 rmq:h-6 rmq:text-accent-soft-foreground" />
        <h1 className="rmq:text-2xl rmq:font-semibold rmq:text-default-800">RabbitMQ</h1>
      </div>
      <Card className="rmq:border rmq:border-default-200 rmq:dark:border-default-100">
        <Card.Content>
          <p className="rmq:text-sm rmq:text-default-500">
            RabbitMQ management plugin. RabbitMQ MQTT servers show a detection badge and connection-status panel in
            the MQTT settings, and broker users can be managed (create, edit, permissions, delete) from the MQTT
            server detail view.
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}

export default class RabbitmqPlugin implements AttraccessFrontendPlugin {
  getPluginName(): string {
    return 'rabbitmq-plugin@0.1.0';
  }

  getDependencies(): string[] {
    return [];
  }

  init(_store: IPluginStore): void {
    // No setup needed.
  }

  activate(): void {
    // Called when the plugin is installed into the store.
  }

  deactivate(): void {
    // Called when the plugin is uninstalled.
  }

  onApiAuthStateChange(_authData: null | AttraccessFrontendPluginAuthData): void {
    // no-op — detection is read via relative `/api` URLs with session cookies.
  }

  onApiEndpointChange(_endpoint: string): void {
    // no-op
  }

  getRoutes(): RouteConfig[] {
    // Same access level as the host MQTT servers settings page.
    return [{ path: '/rabbitmq', authRequired: 'resources.update', element: <RabbitmqPage /> }];
  }

  getSidebarItems(): PluginSidebarItem[] {
    return [
      {
        label: 'RabbitMQ',
        path: '/rabbitmq',
        icon: <RabbitIcon className="rmq:w-5 rmq:h-5" />,
      },
    ];
  }

  // Contribute UI into the host's generic MQTT slots. Each contribution is
  // scoped to one server via the host-supplied `{ mqttServerId }` context and
  // renders nothing unless that server is detected as RabbitMQ.
  getSlotContributions(): PluginSlotContribution[] {
    const contributions: PluginSlotContribution<MqttServerSlotContext>[] = [
      {
        slotId: MQTT_SERVER_DETAIL_SLOT,
        key: 'rabbitmq-mqtt-detail',
        // Status first, user management below it (ATT-522). The wrapper
        // renders nothing unless the server is detected as RabbitMQ, so the
        // detail view keeps its layout for other brokers.
        render: (context) => <RabbitmqDetailSlot mqttServerId={context.mqttServerId} />,
      },
      {
        slotId: MQTT_SERVER_LIST_ROW_SLOT,
        key: 'rabbitmq-mqtt-list-row',
        render: (context) => <RabbitmqListBadge mqttServerId={context.mqttServerId} />,
      },
    ];
    return contributions;
  }
}
