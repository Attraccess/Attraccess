import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WagoDiagnostics } from './diagnostics';
import { ControllerDropCounts } from './DropCounts';

const useWagoDiagnostics = vi.hoisted(() => vi.fn());
vi.mock('./diagnostics', () => ({ useWagoDiagnostics }));

const diagnostics = {
  capabilities: ['bounded-messages-v1'],
  heartbeatFreshness: 'fresh',
  dropCounts: { oversized: 2, overload: 0 },
} as unknown as WagoDiagnostics;

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows what the controller dropped, with an explanation, in the controller details', () => {
  useWagoDiagnostics.mockReturnValue({ data: diagnostics, isError: false });
  render(<ControllerDropCounts controllerId={1} />);
  expect(screen.getByText('Dropped messages: 2 too large, 0 while overloaded.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain('times out like');
});

it.each([
  ['an older runtime', { capabilities: [], dropCounts: null }, 'not reported by this runtime version'],
  ['a stale heartbeat', { heartbeatFreshness: 'stale' }, 'no current report from the controller'],
])('does not present counters as current for %s', (_name, override, text) => {
  useWagoDiagnostics.mockReturnValue({ data: { ...diagnostics, ...override }, isError: false });
  render(<ControllerDropCounts controllerId={1} />);
  expect(screen.getByText(new RegExp(text))).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});

it('renders nothing while diagnostics are loading or failed', () => {
  useWagoDiagnostics.mockReturnValue({ data: undefined, isError: false });
  const { container } = render(<ControllerDropCounts controllerId={1} />);
  expect(container.textContent).toBe('');
  useWagoDiagnostics.mockReturnValue({ data: diagnostics, isError: true });
  cleanup();
  expect(render(<ControllerDropCounts controllerId={1} />).container.textContent).toBe('');
});
