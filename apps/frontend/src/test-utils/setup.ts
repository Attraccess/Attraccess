import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Ensure React uses the non-production build in tests so act() is available
process.env.NODE_ENV = 'test';

class TestStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

Object.defineProperty(globalThis, 'Storage', {
  value: TestStorage,
  configurable: true,
});

Object.defineProperty(window, 'Storage', {
  value: TestStorage,
  configurable: true,
});

const defineStorage = (name: 'localStorage' | 'sessionStorage') => {
  const storage = new TestStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(window, name, {
    value: storage,
    configurable: true,
  });
};

defineStorage('localStorage');
defineStorage('sessionStorage');

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
