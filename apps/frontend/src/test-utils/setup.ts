import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Ensure React uses the non-production build in tests so act() is available
process.env.NODE_ENV = 'test';

// ponytail: suppress happy-dom's AbortError thrown during iframe/fetch teardown
// on Node.js 26. The error originates inside happy-dom's DetachedWindowAPI.abort()
// and is harmless — all tests have already completed by then — but it crashes the
// vitest worker, making the entire test file appear to fail.
process.on('uncaughtException', (err) => {
  if (err instanceof DOMException && err.name === 'AbortError') return;
  throw err;
});

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
  };
}

// Guarded: some specs (e.g. those loading vendored WASM modules that rely on
// Node's real `import.meta.url` semantics) opt into `// @vitest-environment node`,
// where `window` does not exist. This file's setup still runs for them.
const localStorageMock = createStorageMock();
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

// Mock Web Serial API globally for all tests
const mockSerialPort = {
  readable: null,
  writable: null,
  open: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  forget: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockReturnValue({}),
  getSignals: vi.fn().mockResolvedValue({}),
  setSignals: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockSerial = {
  getPorts: vi.fn().mockResolvedValue([]),
  requestPort: vi.fn().mockResolvedValue(mockSerialPort),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Add Web Serial API to global navigator
if (typeof global.navigator !== 'undefined') {
  Object.defineProperty(global.navigator, 'serial', {
    value: mockSerial,
    writable: true,
    configurable: true,
  });
}

// Mock window.matchMedia for components using media queries
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
