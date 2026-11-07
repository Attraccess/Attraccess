import { create } from 'zustand';

export type PwaUpdateStatus = 'idle' | 'downloading' | 'ready' | 'applying';

export interface PwaUpdateState {
  status: PwaUpdateStatus;
  /** 0..1, or null while no progress data has arrived (indeterminate). */
  progress: number | null;
}

export const usePwaUpdateStore = create<PwaUpdateState>(() => ({ status: 'idle', progress: null }));

export const IDLE_APPLY_MS = 5 * 60 * 1000;
/** Wait for the page to finish loading before the boot-time apply: Chrome can leave a waiting worker
 * stuck when SKIP_WAITING arrives while the page is still loading. */
export const BOOT_APPLY_DELAY_MS = 1500;
/** How long to wait for the new worker to take over before giving up on an apply. */
export const APPLY_TIMEOUT_MS = 8000;
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
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  checkForUpdates?: boolean;
}

const set = (state: Partial<PwaUpdateState>) => usePwaUpdateStore.setState(state);

function getSessionStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
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

  // A hard reload leaves the page uncontrolled although a worker is active; its next claim is still an update.
  let hadController = !!sw.controller || !!registration.active;
  let reloading = false;
  let activatedElsewhere = false;
  let applyRequested = false;
  let applyTimer: ReturnType<typeof setTimeout> | undefined;
  let teardownTriggers: (() => void) | null = null;
  const cleanups: Array<() => void> = [];

  usePwaUpdateStore.setState({ status: 'idle', progress: null });

  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    reload();
    // A beforeunload prompt ("Leave site?") can cancel the reload. If this page is still alive, the new
    // version is active but not loaded: go back to ready so the next apply reloads.
    const timer = setTimeout(() => {
      reloading = false;
      applyRequested = false;
      activatedElsewhere = true;
      set({ status: 'ready', progress: 1 });
      rearmTriggers();
    }, APPLY_TIMEOUT_MS);
    cleanups.push(() => clearTimeout(timer));
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
    applyTimer = setTimeout(giveUpApplying, APPLY_TIMEOUT_MS);
  };

  // The worker never took over (e.g. the browser ignored SKIP_WAITING): don't leave the card stuck on
  // "applying" with disabled buttons. Back to ready, so the user or a later trigger can try again.
  const giveUpApplying = () => {
    if (reloading || usePwaUpdateStore.getState().status !== 'applying') return;
    console.warn('Service worker update did not activate; keeping the update ready.');
    applyRequested = false;
    set({ status: 'ready' });
    rearmTriggers();
  };

  const rearmTriggers = () => {
    teardownTriggers?.();
    teardownTriggers = armAutoApply();
  };

  const enterReady = () => {
    set({ status: 'ready', progress: 1 });
    if (doc.visibilityState === 'hidden') {
      apply();
      return;
    }
    rearmTriggers();
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

    // A reload or navigation also hides the page, but unloading ends before this timer can fire, so only a
    // page that stays alive (a switched tab) applies. Posting SKIP_WAITING while the page unloads can leave
    // Chrome with a waiting worker that never activates; the boot-time check applies after a reload instead.
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      if (doc.visibilityState !== 'hidden') return;
      hiddenTimer = setTimeout(() => {
        if (doc.visibilityState === 'hidden') apply();
      }, 0);
    };
    doc.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(hiddenTimer);
      ACTIVITY_EVENTS.forEach((e) => win.removeEventListener(e, resetTimer, { capture: true }));
      doc.removeEventListener('visibilitychange', onVisibility);
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
        // An earlier update may still be waiting; keep offering that one.
        if (registration.waiting) enterReady();
        else set({ status: 'idle', progress: null });
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
      const next = Math.min(1, Math.max(0, data.done / data.total));
      set({ progress: Math.max(usePwaUpdateStore.getState().progress ?? 0, next) });
    }
  };
  sw.addEventListener('message', onMessage);
  cleanups.push(() => sw.removeEventListener('message', onMessage));

  const onControllerChange = () => {
    // The first claim after a fresh install is not an update. Later changes in this page are.
    if (!hadController) {
      hadController = true;
      return;
    }
    markControllerChanged();
    clearTimeout(applyTimer);
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

  const applyAfterLoad = () => {
    const run = () => {
      const timer = setTimeout(apply, BOOT_APPLY_DELAY_MS);
      cleanups.push(() => clearTimeout(timer));
    };
    if (doc.readyState === 'complete') {
      run();
      return;
    }
    win.addEventListener('load', run, { once: true });
    cleanups.push(() => win.removeEventListener('load', run));
  };

  // Boot: pick up an update that finished downloading before this page started.
  if (sw.controller) {
    if (registration.waiting) {
      const alreadyTried = (() => {
        try {
          // Without a working guard, never auto-apply: it could loop.
          return !session || session.getItem(BOOT_APPLY_STORAGE_KEY) === '1';
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
          applyAfterLoad();
        } catch {
          // The guard could not be stored: same as no guard.
          enterReady();
        }
      }
    } else {
      // Nothing waiting: the last boot-time apply (if any) worked, so a later update may boot-apply again.
      try {
        session?.removeItem(BOOT_APPLY_STORAGE_KEY);
      } catch {
        // Keeping the guard only means a later update shows the card instead of applying at boot.
      }
      if (registration.installing) track(registration.installing);
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
      clearTimeout(applyTimer);
      teardownTriggers?.();
      cleanups.forEach((fn) => fn());
    },
  };
}

// --- Chunk-load safety net -------------------------------------------------

const CHUNK_RELOAD_STORAGE_KEY = 'attraccess.pwaUpdate.chunkReloadAt';
const CHUNK_RELOAD_WINDOW_MS = 30_000;
/** A failed lazy import this soon after the worker changed is likely a chunk the new version removed. */
const CONTROLLER_CHANGE_WINDOW_MS = 5 * 60 * 1000;
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
    (controllerChangedAt !== null && now - controllerChangedAt < CONTROLLER_CHANGE_WINDOW_MS);
  // Without storage there is no loop guard, so never force a reload.
  if (!updateInPlay || !storage) return false;
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY) ?? 0);
    if (now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** Matches the dynamic import failures of Chromium, Firefox and Safari. */
export function isChunkLoadError(reason: unknown): boolean {
  const message = String((reason as Error | undefined)?.message ?? reason);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
    message,
  );
}

export function installChunkLoadSafetyNet() {
  const onPreloadError = (event: Event) => {
    if (handleChunkLoadError()) event.preventDefault();
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    if (isChunkLoadError(event.reason)) handleChunkLoadError();
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
