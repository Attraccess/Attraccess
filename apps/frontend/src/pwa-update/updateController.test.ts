import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPLY_TIMEOUT_MS,
  BOOT_APPLY_DELAY_MS,
  BOOT_APPLY_STORAGE_KEY,
  handleChunkLoadError,
  IDLE_APPLY_MS,
  startPwaUpdateController,
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
  };
}

function setup(
  opts: {
    controller?: boolean;
    waiting?: FakeWorker;
    hidden?: boolean;
    loading?: boolean;
    storage?: ReturnType<typeof memoryStorage>;
  } = {},
) {
  const registration = Object.assign(new EventTarget(), {
    installing: null as FakeWorker | null,
    waiting: opts.waiting ?? null,
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
    checkForUpdates: false,
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
  return { registration, sw, win, doc, reload, controller, foundUpdate, hide, message, storage };
}

const status = () => usePwaUpdateStore.getState().status;
const progress = () => usePwaUpdateStore.getState().progress;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
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
    vi.advanceTimersByTime(APPLY_TIMEOUT_MS);
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

  it('applies after 5 minutes without input and input resets the timer', () => {
    const t = readyTab();
    vi.advanceTimersByTime(IDLE_APPLY_MS - 1000);
    t.win.dispatchEvent(new Event('keydown'));
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
    expect(status()).toBe('ready');
    expect(again.registration.waiting?.postMessage).not.toHaveBeenCalled();
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
});
