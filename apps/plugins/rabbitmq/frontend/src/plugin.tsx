// RabbitMQ management plugin — frontend half.
//
// Contributes a "RabbitMQ" badge in the MQTT server list and a
// connection-status panel in the MQTT server detail view, both driven by the
// plugin's backend detection endpoint. The host stays RabbitMQ-agnostic — it
// only exposes the generic slots and renders whatever we contribute.
import './styles.css';
import type {
  AttraccessFrontendPlugin,
  AttraccessFrontendPluginAuthData,
  PluginSlotContribution,
} from '@attraccess/plugins-frontend-sdk';
import type { IPluginStore } from 'react-pluggable';
import { useDetection } from './detection/detection';
import { RabbitmqListBadge } from './users/RabbitmqListBadge';
import { RabbitmqStatusPanel } from './detection/RabbitmqStatusPanel';
import { RabbitmqUserPanel } from './users/RabbitmqUserPanel';
import { RabbitmqConnectionsPanel } from './connections/RabbitmqConnectionsPanel';
import { RabbitmqStatsPanel } from './stats/RabbitmqStatsPanel';
import { RabbitmqMessagesPanel } from './messages/RabbitmqMessagesPanel';
import { useCapabilities } from './capabilities';

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

// Data panels behind working management credentials. The message explorer is
// manage-tier only: it is not rendered at all for view-only users.
function RabbitmqDataPanels({ mqttServerId, canManage }: { mqttServerId: number; canManage: boolean }) {
  return (
    <>
      <RabbitmqConnectionsPanel mqttServerId={mqttServerId} canManage={canManage} />
      <RabbitmqStatsPanel mqttServerId={mqttServerId} />
      {canManage && <RabbitmqMessagesPanel mqttServerId={mqttServerId} />}
    </>
  );
}

// Everything the plugin contributes to the MQTT server detail view: the
// connection-status panel (ATT-521), users (ATT-522), connections (ATT-523),
// broker stats (ATT-524) and, for the manage tier, the message explorer
// (ATT-525).
// Returns null (no wrapper element) for non-RabbitMQ servers so the host
// layout is unchanged unless a RabbitMQ broker is positively detected.
export function RabbitmqDetailSlot({ mqttServerId }: { mqttServerId: number }) {
  const { result } = useDetection(mqttServerId);
  const { canManage } = useCapabilities();

  if (!result?.isRabbitMQ) {
    return null;
  }

  return (
    <div className="rmq:flex rmq:flex-col rmq:gap-4 rmq:w-full">
      <RabbitmqStatusPanel mqttServerId={mqttServerId} />
      <RabbitmqUserPanel mqttServerId={mqttServerId} canManage={canManage} />
      {result.authOk && <RabbitmqDataPanels mqttServerId={mqttServerId} canManage={canManage} />}
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
