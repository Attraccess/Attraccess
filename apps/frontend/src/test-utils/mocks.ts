import { vi } from 'vitest';

/**
 * Mock implementations for toast hooks
 */
export const mockToastHooks = {
  ToastProvider: vi.fn(({ children }) => children),
  useToastMessage: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })),
};

/**
 * Resets all mocks
 */
export function resetAllMocks() {
  Object.values(mockToastHooks).forEach((mock) => mock.mockReset());
}

/**
 * Mock implementations for window methods
 */
export const mockWindow = {
  scrollTo: vi.fn(),
  matchMedia: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
};
