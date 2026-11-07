import { create } from 'zustand';

export type PwaUpdateStatus = 'idle' | 'downloading' | 'ready' | 'applying';

export interface PwaUpdateState {
  status: PwaUpdateStatus;
  /** 0..1, or null while no progress data has arrived (indeterminate). */
  progress: number | null;
}

export const usePwaUpdateStore = create<PwaUpdateState>(() => ({ status: 'idle', progress: null }));

export const IDLE_APPLY_MS = 5 * 60 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const BOOT_APPLY_STORAGE_KEY = 'attraccess.pwaUpdate.bootApplied';
export const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'pointermove',
  'pointerdown',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
] as const;

export interface PwaUpdateControllerOptions {
  registration: ServiceWorkerRegistration;
  serviceWorker?: ServiceWorkerContainer;
  doc?: Document;
  win?: Window;
  reload?: () => void;
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  checkForUpdates?: boolean;
}

const set = (state: Partial<PwaUpdateState>) => usePwaUpdateStore.setState(state);

function getSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Drives the update flow for one service worker registration. Returns `apply` and a `dispose`.
 * Nothing here reloads the page except `apply()` (explicitly or via an auto-apply trigger),
 * a hidden tab seeing another tab's activation, and the boot-time waiting check.
 */
export function startPwaUpdateController(options: PwaUpdateControllerOptions) {
  const { registration } = options;
  const sw = options.serviceWorker ?? navigator.serviceWorker;
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const reload = options.reload ?? (() => win.location.reload());
  const session = options.sessionStorage ?? getSessionStorage();

  const hadController = !!sw.controller;
  let reloading = false;
  let activatedElsewhere = false;
  let applyRequested = false;
  let teardownTriggers: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  usePwaUpdateStore.setState({ status: 'idle', progress: null });

  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    reload();
  };

  const postSkipWaiting = () => {
    try {
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.warn('Could not ask the waiting service worker to activate', error);
    }
  };

  const apply = () => {
    const { status } = usePwaUpdateStore.getState();
    if (status !== 'ready' || reloading) return;
    if (activatedElsewhere || !registration.waiting) {
      reloadOnce();
      return;
    }
    applyRequested = true;
    set({ status: 'applying' });
    postSkipWaiting();
  };

  const enterReady = () => {
    set({ status: 'ready', progress: 1 });
    if (doc.visibilityState === 'hidden') {
      apply();
      return;
    }
    teardownTriggers?.();
    teardownTriggers = armAutoApply();
  };

  const armAutoApply = () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(apply, IDLE_APPLY_MS);
    };
    // Capture so non-bubbling scroll events from nested containers still count.
    ACTIVITY_EVENTS.forEach((e) => win.addEventListener(e, resetTimer, { passive: true, capture: true }));
    resetTimer();

    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') apply();
    };
    // Best effort while the page unloads, so a manual reload picks up the new version.
    const onPageHide = () => {
      if (!activatedElsewhere) postSkipWaiting();
    };
    doc.addEventListener('visibilitychange', onVisibility);
    win.addEventListener('pagehide', onPageHide);

    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => win.removeEventListener(e, resetTimer, { capture: true }));
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pagehide', onPageHide);
    };
  };

  const track = (worker: ServiceWorker | null) => {
    // Without a controller this is the first install, not an update.
    if (!worker || !sw.controller) return;
    set({ status: 'downloading', progress: null });

    const onState = () => {
      if (worker.state === 'installed') {
        worker.removeEventListener('statechange', onState);
        enterReady();
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onState);
        console.warn('Service worker update failed to install; will retry on the next check.');
        set({ status: 'idle', progress: null });
      }
    };
    worker.addEventListener('statechange', onState);
    onState();
  };

  const onUpdateFound = () => track(registration.installing);
  registration.addEventListener('updatefound', onUpdateFound);
  cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound));

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; done?: number; total?: number } | undefined;
    if (data?.type !== 'SW_UPDATE_PROGRESS' || usePwaUpdateStore.getState().status !== 'downloading') return;
    if (typeof data.done === 'number' && typeof data.total === 'number' && data.total > 0) {
      set({ progress: Math.min(1, Math.max(0, data.done / data.total)) });
    }
  };
  sw.addEventListener('message', onMessage);
  cleanups.push(() => sw.removeEventListener('message', onMessage));

  const onControllerChange = () => {
    // The first claim after a fresh install is not an update.
    if (!hadController) return;
    markControllerChanged();
    if (applyRequested) {
      reloadOnce();
      return;
    }
    // Another tab activated the new version; this tab is running stale assets.
    activatedElsewhere = true;
    if (doc.visibilityState === 'hidden') {
      reloadOnce();
      return;
    }
    enterReady();
  };
  sw.addEventListener('controllerchange', onControllerChange);
  cleanups.push(() => sw.removeEventListener('controllerchange', onControllerChange));

  // Boot: pick up an update that finished downloading before this page started.
  if (sw.controller) {
    if (registration.waiting) {
      const alreadyTried = (() => {
        try {
          return session?.getItem(BOOT_APPLY_STORAGE_KEY) === '1';
        } catch {
          return true;
        }
      })();
      if (alreadyTried) {
        enterReady();
      } else {
        try {
          session?.setItem(BOOT_APPLY_STORAGE_KEY, '1');
          set({ status: 'ready', progress: 1 });
          apply();
        } catch {
          // Without a working guard, never auto-apply: it could loop.
          enterReady();
        }
      }
    } else if (registration.installing) {
      track(registration.installing);
    }
  }

  let interval: ReturnType<typeof setInterval> | undefined;
  if (options.checkForUpdates ?? import.meta.env.PROD) {
    interval = setInterval(() => {
      registration.update().catch(() => undefined);
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  return {
    apply,
    dispose() {
      if (interval) clearInterval(interval);
      teardownTriggers?.();
      cleanups.forEach((fn) => fn());
    },
  };
}

// --- Chunk-load safety net -------------------------------------------------

const CHUNK_RELOAD_STORAGE_KEY = 'attraccess.pwaUpdate.chunkReloadAt';
const CHUNK_RELOAD_WINDOW_MS = 30_000;
let controllerChangedAt: number | null = null;

function markControllerChanged() {
  controllerChangedAt = Date.now();
}

/** Reload after a failed lazy import, but only when an update explains it; at most once per 30s. */
export function handleChunkLoadError(
  now = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = getSessionStorage(),
  reload: () => void = () => window.location.reload(),
): boolean {
  const { status } = usePwaUpdateStore.getState();
  const updateInPlay =
    status === 'ready' ||
    status === 'applying' ||
    (controllerChangedAt !== null && now - controllerChangedAt < 5 * 60 * 1000);
  if (!updateInPlay) return false;
  try {
    const last = Number(storage?.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? 0);
    if (now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage?.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

export function installChunkLoadSafetyNet() {
  const onPreloadError = (event: Event) => {
    if (handleChunkLoadError()) event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const message = String((event.reason as Error | undefined)?.message ?? event.reason);
    if (
      /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
        message,
      )
    ) {
      handleChunkLoadError();
    }
  };
  window.addEventListener('vite:preloadError', onPreloadError);
  window.addEventListener('unhandledrejection', onRejection);
}

let applyFn: (() => void) | null = null;

export function setPwaUpdateApply(fn: () => void) {
  applyFn = fn;
}

/** Apply the ready update from the UI. */
export function applyPwaUpdate() {
  applyFn?.();
}
