import '@testing-library/jest-dom';
import { vi } from 'vitest';
import './test-utils/setupIntegrationTests';

// Mock import.meta for Vite environment variables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).import = {
  meta: {
    env: {
      MODE: 'test',
    },
  },
};

// Mock window methods
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver;

// Mock IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '0px';
  readonly thresholds: ReadonlyArray<number> = [0];

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    callback: IntersectionObserverCallback,

    options?: IntersectionObserverInit
  ) {
    // This is a mock implementation, so we don't need to use the callback or options
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}
global.IntersectionObserver = MockIntersectionObserver;

// Suppress console errors during tests
console.error = vi.fn();
