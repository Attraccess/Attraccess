import { registerSW } from 'virtual:pwa-register';
import { installChunkLoadSafetyNet, setPwaUpdateApply, startPwaUpdateController } from './updateController';

/** Registers the service worker and starts the update flow (replaces the old auto-reloading registerSW). */
export function registerPwaUpdates() {
  installChunkLoadSafetyNet();
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration || !import.meta.env.PROD) return;
      setPwaUpdateApply(startPwaUpdateController({ registration }).apply);
    },
  });
}
