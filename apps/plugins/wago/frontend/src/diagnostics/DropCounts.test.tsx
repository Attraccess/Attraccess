import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WagoDiagnostics } from './diagnostics';
import { ControllerDropCountsRow, ControllerDropCountsWarning } from './DropCounts';

const useWagoDiagnostics = vi.hoisted(() => vi.fn());
vi.mock('./diagnostics', () => ({ useWagoDiagnostics }));

const diagnostics = {
  capabilities: ['bounded-messages-v1'],
  heartbeatFreshness: 'fresh',
  dropCounts: { oversized: 2, overload: 0 },
} as unknown as WagoDiagnostics;

/** The controller details drawer: the row sits in its fact list, the warning next to its other alerts. */
function Details() {
  return (
    <>
      <dl>
        <ControllerDropCountsRow controllerId={1} />
      </dl>
      <ControllerDropCountsWarning controllerId={1} />
    </>
  );
}

beforeEach(() => useTranslationState.setState({ language: 'en' }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows what the controller dropped as a fact row, with a warning, in the controller details', () => {
  useWagoDiagnostics.mockReturnValue({ data: diagnostics, isError: false });
  render(<Details />);
  const term = screen.getByText('Dropped messages');
  expect(term.tagName).toBe('DT');
  expect(term.nextElementSibling?.tagName).toBe('DD');
  expect(term.nextElementSibling?.textContent).toBe('2 too large · 0 while overloaded');
  expect(screen.getByText(/times out like a command to an offline controller/)).toBeTruthy();
});

it('shows the German row and warning', () => {
  useTranslationState.setState({ language: 'de' });
  useWagoDiagnostics.mockReturnValue({ data: diagnostics, isError: false });
  render(<Details />);
  expect(screen.getByText('Verworfene Nachrichten').nextElementSibling?.textContent).toBe(
    '2 zu groß · 0 bei Überlastung',
  );
  expect(screen.getByText(/Für einen verworfenen Befehl tritt eine Zeitüberschreitung ein/)).toBeTruthy();
});

it.each([
  ['an older runtime', { capabilities: [], dropCounts: null }, 'Not reported by this runtime version'],
  ['a stale heartbeat', { heartbeatFreshness: 'stale' }, 'No current report from the controller'],
  ['no dropped message', { dropCounts: { oversized: 0, overload: 0 } }, '0 too large · 0 while overloaded'],
])('does not warn for %s', (_name, override, text) => {
  useWagoDiagnostics.mockReturnValue({ data: { ...diagnostics, ...override }, isError: false });
  render(<Details />);
  expect(screen.getByText('Dropped messages').nextElementSibling?.textContent).toBe(text);
  expect(screen.queryByText(/times out like/)).toBeNull();
});

it('renders nothing while diagnostics are loading or failed', () => {
  useWagoDiagnostics.mockReturnValue({ data: undefined, isError: false });
  const { container } = render(<Details />);
  expect(container.textContent).toBe('');
  useWagoDiagnostics.mockReturnValue({ data: diagnostics, isError: true });
  cleanup();
  expect(render(<Details />).container.textContent).toBe('');
});
