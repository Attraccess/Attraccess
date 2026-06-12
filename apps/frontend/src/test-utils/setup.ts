import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Ensure React uses the non-production build in tests so act() is available
process.env.NODE_ENV = 'test';

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

const localStorageMock = createStorageMock();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
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
Object.defineProperty(global.navigator, 'serial', {
  value: mockSerial,
  writable: true,
  configurable: true,
});

// Mock window.matchMedia for components using media queries
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
