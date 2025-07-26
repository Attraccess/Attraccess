import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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
