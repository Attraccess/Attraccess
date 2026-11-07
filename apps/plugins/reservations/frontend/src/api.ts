// Access to the plugin's own backend endpoints (`/api/reservations/*`) through the
// SDK's preconfigured client — it supplies the host's API origin, the session
// cookie and JSON/error handling.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export const api = createPluginApiClient('/api/reservations');
