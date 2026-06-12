import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Ensure React uses the non-production build in tests so act() is available
process.env.NODE_ENV = 'test';

class TestStorage implements Storage {
  private readonly store = new Map<string, string>();

  public get length() {
    return this.store.size;
  }

  public clear() {
    this.store.clear();
  }

  public getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  public key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  public removeItem(key: string) {
    this.store.delete(key);
  }

  public setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

Object.defineProperty(globalThis, 'Storage', {
  value: TestStorage,
  writable: true,
  configurable: true,
});
Object.defineProperty(window, 'localStorage', {
  value: new TestStorage(),
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: window.localStorage,
  writable: true,
  configurable: true,
});

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
