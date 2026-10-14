import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTwoFactorGate } from './useTwoFactorGate';
const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
const storage = sessionStorage;
const originalGetItem = storage.getItem;
const originalRemoveItem = storage.removeItem;
const state = vi.hoisted(() => ({
  isAuthenticated: true,
  needsTwoFactorSetup: false,
  isTwoFactorStatusLoading: false,
  twoFactorStatus: { enabled: false },
}));
vi.mock('./useAuth', () => ({ useAuth: () => state }));
beforeEach(() => {
  sessionStorage.clear();
  state.isAuthenticated = true;
  state.needsTwoFactorSetup = false;
  state.isTwoFactorStatusLoading = false;
  state.twoFactorStatus = { enabled: false };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (storageDescriptor) Object.defineProperty(window, 'sessionStorage', storageDescriptor);
  storage.getItem = originalGetItem;
  storage.removeItem = originalRemoveItem;
});

it.each(['getter', 'methods'])('preserves required setup when session storage %s fail', (fault) => {
  state.needsTwoFactorSetup = true;
  if (fault === 'getter') {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
  } else {
    sessionStorage.getItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
    sessionStorage.removeItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
  }
  const view = renderHook(useTwoFactorGate);
  expect(view.result.current.shouldShow).toBe(true);
  expect(view.result.current.canSkip).toBe(false);
  act(() => view.result.current.clearSetupIntent());
  expect(view.result.current.shouldShow).toBe(true);
  state.needsTwoFactorSetup = false;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(false);
});
it('defers the mandatory setup gate until authentication and status are ready', () => {
  state.needsTwoFactorSetup = true;
  state.isTwoFactorStatusLoading = true;
  const view = renderHook(useTwoFactorGate);
  expect(view.result.current.shouldShow).toBe(false);
  state.isTwoFactorStatusLoading = false;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(true);
  expect(view.result.current.canSkip).toBe(false);
  state.isAuthenticated = false;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(false);
});
it('honors optional setup intent and allows clearing it for the session', () => {
  sessionStorage.setItem('twoFactorSetupIntent', 'true');
  const { result } = renderHook(useTwoFactorGate);
  expect(result.current.shouldShow).toBe(true);
  expect(result.current.canSkip).toBe(true);
  act(() => result.current.clearSetupIntent());
  expect(result.current.shouldShow).toBe(false);
  expect(sessionStorage.getItem('twoFactorSetupIntent')).toBeNull();
});
it('removes an obsolete setup intent when two-factor authentication becomes enabled', () => {
  sessionStorage.setItem('twoFactorSetupIntent', 'true');
  const view = renderHook(useTwoFactorGate);
  expect(view.result.current.shouldShow).toBe(true);
  state.twoFactorStatus = { enabled: true };
  view.rerender();
  expect(view.result.current.shouldShow).toBe(false);
  expect(sessionStorage.getItem('twoFactorSetupIntent')).toBeNull();
});
