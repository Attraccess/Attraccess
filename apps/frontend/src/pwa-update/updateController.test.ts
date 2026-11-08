import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_EVENTS,
  APPLY_TIMEOUT_MS,
  BOOT_APPLY_DELAY_MS,
  BOOT_APPLY_STORAGE_KEY,
  handleChunkLoadError,
  IDLE_APPLY_MS,
  isChunkLoadError,
  startPwaUpdateController,
  UPDATE_CHECK_INTERVAL_MS,
  usePwaUpdateStore,
} from './updateController';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
  setState(state: string) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

function setup(
  opts: {
    controller?: boolean;
    waiting?: FakeWorker;
    installing?: FakeWorker;
    active?: boolean;
    checkForUpdates?: boolean;
    hidden?: boolean;
    loading?: boolean;
    storage?: ReturnType<typeof memoryStorage>;
  } = {},
) {
  const registration = Object.assign(new EventTarget(), {
    installing: (opts.installing ?? null) as FakeWorker | null,
    waiting: opts.waiting ?? null,
    active: opts.active ? {} : null,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const sw = Object.assign(new EventTarget(), { controller: (opts.controller === false ? null : {}) as object | null });
  const win = new EventTarget() as unknown as Window;
  const doc = Object.assign(new EventTarget(), {
    visibilityState: opts.hidden ? 'hidden' : 'visible',
    readyState: opts.loading ? 'loading' : 'complete',
  }) as unknown as Document;
  const reload = vi.fn();
  const storage = opts.storage ?? memoryStorage();
  const controller = startPwaUpdateController({
    registration: registration as unknown as ServiceWorkerRegistration,
    serviceWorker: sw as unknown as ServiceWorkerContainer,
    doc,
    win,
    reload,
    sessionStorage: storage,
    checkForUpdates: opts.checkForUpdates ?? false,
  });
  const foundUpdate = () => {
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    return worker;
  };
  const hide = () => {
    (doc as unknown as { visibilityState: string }).visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const message = (data: unknown) => sw.dispatchEvent(new MessageEvent('message', { data }));
  const show = () => {
    (doc as unknown as { visibilityState: string }).visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { registration, sw, win, doc, reload, controller, foundUpdate, hide, show, message, storage };
}

const status = () => usePwaUpdateStore.getState().status;
const progress = () => usePwaUpdateStore.getState().progress;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('update detection', () => {
  it('shows nothing on first install (no controller)', () => {
    const t = setup({ controller: false });
    const worker = t.foundUpdate();
    worker.setState('installed');
    expect(status()).toBe('idle');
  });

  it('goes downloading → ready with progress and an indeterminate start', () => {
    const t = setup();
    const worker = t.foundUpdate();
    expect(status()).toBe('downloading');
    expect(progress()).toBeNull();
    t.message({ type: 'SW_UPDATE_PROGRESS', done: 1, total: 4 });
    expect(progress()).toBe(0.25);
    t.message({ type: 'SW_UPDATE_PROGRESS', done: 0, total: 0 });
    expect(progress()).toBe(0.25);
    worker.setState('installed');
    expect(status()).toBe('ready');
  });

  it('never moves progress backwards', () => {
    const t = setup();
    t.foundUpdate();
    t.message({ type: 'SW_UPDATE_PROGRESS', done: 2, total: 4 });
    t.message({ type: 'SW_UPDATE_PROGRESS', done: 0, total: 4 });
    expect(progress()).toBe(0.5);
  });

  it('keeps offering a waiting update when a newer download fails', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup();
    t.registration.waiting = new FakeWorker();
    t.foundUpdate().setState('installed');
    t.foundUpdate().setState('redundant');
    expect(status()).toBe('ready');
  });

  it('checks for updates every 15 minutes until disposed', () => {
    const t = setup({ checkForUpdates: true });
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    expect(t.registration.update).toHaveBeenCalledOnce();
    t.controller.dispose();
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
    expect(t.registration.update).toHaveBeenCalledOnce();
  });

  it('returns to idle with a warning when the worker becomes redundant', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup();
    t.foundUpdate().setState('redundant');
    expect(status()).toBe('idle');
    expect(warn).toHaveBeenCalled();
  });
});

describe('apply', () => {
  it('posts SKIP_WAITING and reloads exactly once on controllerchange', () => {
    const waiting = new FakeWorker();
    const t = setup();
    const worker = t.foundUpdate();
    t.registration.waiting = waiting;
    worker.setState('installed');
    t.controller.apply();
    expect(status()).toBe('applying');
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    t.sw.dispatchEvent(new Event('controllerchange'));
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).toHaveBeenCalledOnce();
  });

  it('does nothing unless an update is ready', () => {
    const t = setup();
    t.controller.apply();
    const worker = t.foundUpdate();
    t.registration.waiting = new FakeWorker();
    t.controller.apply();
    vi.advanceTimersByTime(IDLE_APPLY_MS * 2);
    expect(status()).toBe('downloading');
    expect(t.registration.waiting.postMessage).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
    worker.setState('installed');
    expect(status()).toBe('ready');
  });

  it('goes back to ready when a beforeunload prompt cancels the reload, and reloads on the next apply', () => {
    const t = setup();
    t.registration.waiting = new FakeWorker();
    t.foundUpdate().setState('installed');
    t.controller.apply();
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).toHaveBeenCalledOnce();
    // The page is still alive: the user chose to stay.
    vi.advanceTimersByTime(APPLY_TIMEOUT_MS);
    expect(status()).toBe('ready');
    t.controller.apply();
    expect(t.reload).toHaveBeenCalledTimes(2);
  });
});

describe('apply that never activates', () => {
  it('returns to ready with a warning so the user can try again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const waiting = new FakeWorker();
    const t = setup();
    t.registration.waiting = waiting;
    t.foundUpdate().setState('installed');
    t.controller.apply();
    expect(status()).toBe('applying');
    vi.advanceTimersByTime(APPLY_TIMEOUT_MS);
    expect(status()).toBe('ready');
    expect(warn).toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
    t.controller.apply();
    expect(waiting.postMessage).toHaveBeenCalledTimes(2);
  });

  it('does not give up once the new worker took over', () => {
    const t = setup();
    t.registration.waiting = new FakeWorker();
    t.foundUpdate().setState('installed');
    t.controller.apply();
    t.sw.dispatchEvent(new Event('controllerchange'));
    vi.advanceTimersByTime(APPLY_TIMEOUT_MS - 1);
    expect(status()).toBe('applying');
    expect(t.reload).toHaveBeenCalledOnce();
  });
});

describe('auto-apply triggers', () => {
  const readyTab = () => {
    const t = setup();
    t.registration.waiting = new FakeWorker();
    t.foundUpdate().setState('installed');
    return t;
  };

  it.each(ACTIVITY_EVENTS)('applies after 5 minutes without input and %s resets the timer', (type) => {
    const t = readyTab();
    vi.advanceTimersByTime(IDLE_APPLY_MS - 1000);
    t.win.dispatchEvent(new Event(type));
    vi.advanceTimersByTime(IDLE_APPLY_MS - 1000);
    expect(status()).toBe('ready');
    vi.advanceTimersByTime(1000);
    expect(status()).toBe('applying');
  });

  it('applies when the tab is hidden and stays hidden', () => {
    const t = readyTab();
    t.hide();
    vi.advanceTimersByTime(0);
    expect(status()).toBe('applying');
  });

  it('does not apply when the tab is visible again before the deferred check', () => {
    const t = readyTab();
    t.hide();
    t.show();
    vi.advanceTimersByTime(0);
    expect(status()).toBe('ready');
  });

  it('applies right away when the download finishes in a hidden tab', () => {
    const t = setup();
    t.registration.waiting = new FakeWorker();
    const worker = t.foundUpdate();
    t.hide();
    worker.setState('installed');
    expect(status()).toBe('applying');
  });

  it('does not post SKIP_WAITING while the page unloads (visibility hidden, then the page is gone)', () => {
    const t = readyTab();
    t.hide();
    t.controller.dispose();
    vi.advanceTimersByTime(0);
    expect((t.registration.waiting as unknown as FakeWorker).postMessage).not.toHaveBeenCalled();
  });

  it('does not apply on hidden while still downloading', () => {
    const t = setup();
    t.foundUpdate();
    t.hide();
    vi.advanceTimersByTime(0);
    expect(status()).toBe('downloading');
  });

  it('does not send SKIP_WAITING on pagehide; the boot-time check applies after a reload', () => {
    const t = readyTab();
    t.win.dispatchEvent(new Event('pagehide'));
    expect((t.registration.waiting as unknown as FakeWorker).postMessage).not.toHaveBeenCalled();
    expect(status()).toBe('ready');
  });
});

describe('boot-time waiting check', () => {
  it('applies a waiting worker once per session', () => {
    const storage = memoryStorage();
    const waiting = new FakeWorker();
    const first = setup({ waiting, storage });
    expect(status()).toBe('ready');
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS);
    expect(status()).toBe('applying');
    expect(waiting.postMessage).toHaveBeenCalledOnce();
    expect(storage.store.get(BOOT_APPLY_STORAGE_KEY)).toBe('1');
    first.controller.dispose();

    // Same session, worker still waiting: show the card instead of looping.
    const again = setup({ waiting: new FakeWorker(), storage });
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS * 2);
    expect(status()).toBe('ready');
    expect(again.registration.waiting?.postMessage).not.toHaveBeenCalled();
    expect(again.reload).not.toHaveBeenCalled();
  });

  it('applies a later update at boot again once the earlier one went through', () => {
    const storage = memoryStorage();
    setup({ waiting: new FakeWorker(), storage }).controller.dispose();
    // The reload found nothing waiting: the earlier boot-time apply worked.
    setup({ storage }).controller.dispose();
    expect(storage.store.has(BOOT_APPLY_STORAGE_KEY)).toBe(false);
    const waiting = new FakeWorker();
    setup({ waiting, storage });
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS);
    expect(waiting.postMessage).toHaveBeenCalledOnce();
  });

  it.each([
    ['reading', 'getItem'],
    ['writing', 'setItem'],
  ] as const)('never auto-applies when %s the guard throws', (_, method) => {
    const storage = memoryStorage();
    storage[method] = () => {
      throw new Error('blocked');
    };
    const waiting = new FakeWorker();
    const t = setup({ waiting, storage });
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS * 2);
    expect(status()).toBe('ready');
    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(t.reload).not.toHaveBeenCalled();
  });

  it('never auto-applies without session storage', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    const waiting = new FakeWorker();
    const registration = Object.assign(new EventTarget(), { installing: null, waiting, active: {} });
    startPwaUpdateController({
      registration: registration as unknown as ServiceWorkerRegistration,
      serviceWorker: Object.assign(new EventTarget(), { controller: {} }) as unknown as ServiceWorkerContainer,
      doc: Object.assign(new EventTarget(), {
        visibilityState: 'visible',
        readyState: 'complete',
      }) as unknown as Document,
      win: new EventTarget() as unknown as Window,
      reload: vi.fn(),
      checkForUpdates: false,
    });
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS * 2);
    expect(status()).toBe('ready');
    expect(waiting.postMessage).not.toHaveBeenCalled();
  });

  it('keeps tracking an install that was already running when the page loaded', () => {
    const installing = new FakeWorker();
    setup({ installing });
    expect(status()).toBe('downloading');
    installing.setState('installed');
    expect(status()).toBe('ready');
  });

  it('waits for the page load before applying', () => {
    const waiting = new FakeWorker();
    const t = setup({ waiting, loading: true });
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS * 2);
    expect(waiting.postMessage).not.toHaveBeenCalled();
    t.win.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(BOOT_APPLY_DELAY_MS);
    expect(waiting.postMessage).toHaveBeenCalledOnce();
  });

  it('does nothing without a controller', () => {
    setup({ controller: false, waiting: new FakeWorker() });
    expect(status()).toBe('idle');
  });
});

describe('page that loaded before the first service worker existed', () => {
  it('ignores the first claim but reloads when a later update activates', () => {
    const t = setup({ controller: false });
    t.sw.controller = {};
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).not.toHaveBeenCalled();
    expect(status()).toBe('idle');

    t.registration.waiting = new FakeWorker();
    t.foundUpdate().setState('installed');
    t.controller.apply();
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).toHaveBeenCalledOnce();
  });
});

describe('page loaded uncontrolled although a worker is active (hard reload)', () => {
  it('treats the next claim as an update', () => {
    const t = setup({ controller: false, active: true, hidden: true });
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).toHaveBeenCalledOnce();
  });
});

describe('other tab activated the update', () => {
  it('reloads a hidden tab immediately', () => {
    const t = setup({ hidden: true });
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(t.reload).toHaveBeenCalledOnce();
  });

  it('shows the ready card in a visible tab and reloads on apply', () => {
    const t = setup();
    t.sw.dispatchEvent(new Event('controllerchange'));
    expect(status()).toBe('ready');
    expect(t.reload).not.toHaveBeenCalled();
    t.controller.apply();
    expect(t.reload).toHaveBeenCalledOnce();
  });
});

describe('chunk load safety net', () => {
  it('only reloads when an update is in play, at most once per 30s', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    // Past the window in which an earlier test's controllerchange counts.
    const base = Date.now() + 60 * 60_000;
    usePwaUpdateStore.setState({ status: 'idle', progress: null });
    expect(handleChunkLoadError(base, storage, reload)).toBe(false);
    usePwaUpdateStore.setState({ status: 'ready' });
    expect(handleChunkLoadError(base, storage, reload)).toBe(true);
    expect(handleChunkLoadError(base + 10_000, storage, reload)).toBe(false);
    expect(handleChunkLoadError(base + 31_000, storage, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('never forces a reload without a storage guard', () => {
    const reload = vi.fn();
    usePwaUpdateStore.setState({ status: 'ready' });
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(handleChunkLoadError(Date.now(), undefined, reload)).toBe(false);
    const throwing = {
      getItem: () => '0',
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(handleChunkLoadError(Date.now(), throwing, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('recognises dynamic import failures of the major browsers', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
