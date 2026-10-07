import './styles.css';
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export // The SDK's ready-made client: the host's API origin, the session cookie and
// JSON/error handling are already wired up, so plugins never build their own.
const api = createPluginApiClient('/api/hello-world');

export // Host slot ids exposed by the MQTT UI. These are documented host strings (the
// SDK is vendor-agnostic and does not export them, and the host owns them in
// apps/frontend, which a plugin cannot import — so a plugin restates them, the
// same way it restates a route `path` it links to). Both slots receive
// `{ mqttServerId }`, declared here so each `render` is typed end-to-end with
// no runtime casting.
const MQTT_SERVER_DETAIL_SLOT = 'mqtt.server.detail';

export const MQTT_SERVER_LIST_ROW_SLOT = 'mqtt.server.list.row';
