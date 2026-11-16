import { registerSW } from 'virtual:pwa-register';
import { installChunkLoadSafetyNet, setPwaUpdateApply, startPwaUpdateController } from './updateController';

const SERVICE_WORKER_URL = '/service-worker.js';

/**
 * Registers the service worker and starts the update flow.
 *
 * Production registers the worker directly instead of through `registerSW`: in `prompt` mode the plugin
 * reloads the page itself on `controlling`, in every tab that saw the update waiting. That would reload
 * visible tabs without warning and reload a second time after our own reload.
 */
export function registerPwaUpdates() {
  installChunkLoadSafetyNet();

  if (!import.meta.env.PROD) {
    // Dev keeps applying a changed worker right away, as before the update prompt.
    const updateSW = registerSW({ immediate: true, onNeedRefresh: () => void updateSW(true) });
    return;
  }

  if (!('serviceWorker' in navigator)) return;
  void registerAndTrack();
}

async function registerAndTrack() {
  const registering = navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/', type: 'classic' });
  registering.catch((error) => console.error('Service worker registration failed', error));

  // register() queues behind an install that is already running and only settles once it is done, so a page
  // reloaded mid-download would start tracking too late to show it. An existing registration is available at once.
  const registration =
    (await navigator.serviceWorker.getRegistration('/')) ?? (await registering.catch(() => undefined));
  if (registration) setPwaUpdateApply(startPwaUpdateController({ registration }).apply);
}
