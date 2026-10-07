import { useRoutesWithAuthElements } from './app.use-is-touch-device.helpers';
import { AppRoutes } from './app.app-content.helpers';
import { App } from './app.app-content.helpers';

// Exported for settingsAccess.spec.tsx, which drives the real route table through this gate.
// Exported for notFound.spec.tsx, which drives the real route table (catch-all included).
export default App;

export { useRoutesWithAuthElements };
export { AppRoutes };
export { App } from './app.app-content.helpers';
