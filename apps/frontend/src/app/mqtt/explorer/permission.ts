import type { SystemPermission } from '@attraccess/shared';

// Who may watch and publish MQTT messages: everyone who can edit resources (and
// with them the flows and MQTT servers). Mirrors MQTT_EXPLORER_PERMISSION in
// apps/api/src/mqtt/explorer/mqtt-explorer.constants.ts.
export const MQTT_EXPLORER_PERMISSION: SystemPermission = 'resources.update';
