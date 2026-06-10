// Plugin extension-point ids exposed by the MQTT UI.
//
// These are generic, host-owned slot ids — plugins target them by string via
// `AttraccessFrontendPlugin.getSlotContributions()`. No vendor specifics (e.g.
// RabbitMQ) live here or in the slot contract; the core only knows "render
// whatever plugins contribute for this MQTT server".
//
// Contract: both slots receive `{ mqttServerId: number }` as their context so a
// contribution can scope its UI / data fetching to the selected server.

// Detail/edit view of a single MQTT server (an "extensions" section).
export const MQTT_SERVER_DETAIL_SLOT = 'mqtt.server.detail';

// Per-row action / badge area in the MQTT server list.
export const MQTT_SERVER_LIST_ROW_SLOT = 'mqtt.server.list.row';

// Context shape passed to both MQTT server slots. The index signature keeps it
// assignable to the SDK's generic `PluginSlotContext` (Record<string, unknown>)
// so it can parameterize `PluginSlot<MqttServerSlotContext>`.
export interface MqttServerSlotContext {
  mqttServerId: number;
  [key: string]: unknown;
}
