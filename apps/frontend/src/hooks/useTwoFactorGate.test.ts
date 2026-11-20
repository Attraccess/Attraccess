import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTwoFactorGate } from './useTwoFactorGate';

const state = vi.hoisted(() => ({
  isAuthenticated: true,
  needsTwoFactorSetup: false,
  isTwoFactorStatusLoading: false,
}));
vi.mock('./useAuth', () => ({ useAuth: () => state }));

beforeEach(() => {
  state.isAuthenticated = true;
  state.needsTwoFactorSetup = false;
  state.isTwoFactorStatusLoading = false;
});
afterEach(cleanup);

it('shows the gate only when the server requires two-factor setup', () => {
  const view = renderHook(useTwoFactorGate);
  expect(view.result.current.shouldShow).toBe(false);
  state.needsTwoFactorSetup = true;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(true);
});

it('defers the mandatory setup gate until authentication and status are ready', () => {
  state.needsTwoFactorSetup = true;
  state.isTwoFactorStatusLoading = true;
  const view = renderHook(useTwoFactorGate);
  expect(view.result.current.shouldShow).toBe(false);
  state.isTwoFactorStatusLoading = false;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(true);
  state.isAuthenticated = false;
  view.rerender();
  expect(view.result.current.shouldShow).toBe(false);
});
