import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ResourceUsage } from '@attraccess/react-query-client';
import { UsageNotesModal } from './index';
import { TransactionDetailsModal } from '../../../../billing/dashboard/summary/transactionDetailsModal';

const session = {
  id: 8,
  userId: 1,
  resourceId: 2,
  usageInMinutes: 60,
  formSubmissions: [],
  isFinalized: true,
  startTime: '2026-09-01T10:00:00Z',
  endTime: '2026-09-01T11:00:00Z',
  usageAction: 'usage',
  startNotes: 'Loaded oak boards',
  endNotes: 'Cleaned the machine',
  project: { id: 3, name: 'Workshop shelves' },
} as ResourceUsage;
const state = vi.hoisted(() => ({
  session: undefined as ResourceUsage | undefined,
  transactionId: 7 as number | null,
  fetchSession: vi.fn(),
  fetchBilling: vi.fn(),
  error: undefined as Error | undefined,
  retry: vi.fn(),
  billingError: undefined as Error | undefined,
  retryBilling: vi.fn(),
  operatingDurationError: undefined as Error | undefined,
  retryOperatingDuration: vi.fn(),
  fetchOperatingDuration: vi.fn(),
  canViewOperatingDuration: false,
}));
vi.mock('../../hooks/useUsageSessionProject', () => ({ useUsageSessionProject: () => ({ updatingSessionIds: {} }) }));
vi.mock('../../../operatingDuration', () => ({
  useCanViewOperatingDuration: () => state.canViewOperatingDuration,
  useOperatingDuration: (...args: unknown[]) => {
    state.fetchOperatingDuration(...args);
    return { error: state.operatingDurationError, refetch: state.retryOperatingDuration };
  },
  attributedOperatingDurationForUsage: () => undefined,
}));
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceResourceUsageGetSession: (...args: unknown[]) => {
    state.fetchSession(...args);
    return { data: state.session, error: state.error, refetch: state.retry };
  },
  useBillingServiceGetUsageBillingTransaction: (...args: unknown[]) => {
    state.fetchBilling(...args);
    return { data: { transactionId: state.transactionId }, error: state.billingError, refetch: state.retryBilling };
  },
  useBillingServiceGetBillingTransaction: () => ({
    data: {
      id: 7,
      createdAt: '2026-09-01',
      status: 'completed',
      amount: -500,
      items: [],
      resourceUsageId: 8,
      resourceUsage: { id: 8, resourceId: 2 },
    },
  }),
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 } }),
}));
vi.mock('../../../../billing/dashboard/summary/transactionDetailsModal/refund', () => ({ RefundModal: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  state.session = session;
  state.transactionId = 7;
  state.error = undefined;
  state.billingError = undefined;
  state.operatingDurationError = undefined;
  state.canViewOperatingDuration = false;
});
afterEach(cleanup);

it('opens the billing modal from usage and returns to the original usage drawer without navigating', async () => {
  render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  const originalDrawer = screen.getByRole('dialog');
  const url = window.location.href;
  fireEvent.click(screen.getByRole('button', { name: 'Open billing overview' }));
  expect(await screen.findByText('Transaction details')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open usage details' }));
  const dialogs = screen.getAllByRole('dialog');
  expect(within(dialogs[dialogs.length - 1]).getByText('Loaded oak boards')).toBeTruthy();
  expect(within(dialogs[dialogs.length - 1]).getByText('Workshop shelves')).toBeTruthy();
  fireEvent.click(within(dialogs[dialogs.length - 1]).getByRole('button', { name: 'Open billing overview' }));
  expect(screen.getByText('Transaction details')).toBeTruthy();
  fireEvent.keyDown(screen.getByText('Transaction details'), { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByText('Transaction details')).toBeNull());
  expect(screen.getByRole('dialog')).toBe(originalDrawer);
  expect(within(originalDrawer).getByText('Loaded oak boards')).toBeTruthy();
  expect(within(originalDrawer).getByText('Cleaned the machine')).toBeTruthy();
  expect(within(originalDrawer).getByText('Workshop shelves')).toBeTruthy();
  expect(window.location.href).toBe(url);
});

it('opens existing usage details from billing, then closes back to billing', async () => {
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open usage details' }));
  expect(screen.getByText('Cleaned the machine')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
  expect(screen.queryByText('Cleaned the machine')).toBeNull();
  expect(screen.getByText('Transaction details')).toBeTruthy();
});

it('omits billing actions for sessions without a transaction or owned by another user', () => {
  state.transactionId = null;
  const view = render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Open billing overview' })).toBeNull();
  state.session = { ...session, userId: 2 };
  state.transactionId = 7;
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Open billing overview' })).toBeNull();
  expect(state.fetchBilling).toHaveBeenLastCalledWith({ usageId: 8 }, undefined, { enabled: false });
});

it('fetches usage details by ID only while open and shows a retryable error', () => {
  const view = render(<UsageNotesModal isOpen={false} resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(state.fetchSession).not.toHaveBeenCalled();
  state.session = undefined;
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(state.fetchSession).toHaveBeenCalledWith({ resourceId: 2, usageId: 8 });
  expect(document.querySelector('.spinner')).toBeTruthy();
  state.error = new Error('Unavailable');
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load usage details.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(state.retry).toHaveBeenCalled();
});

it('keeps usage details visible while independently retrying a failed billing lookup', () => {
  state.transactionId = null;
  state.billingError = new Error('Unavailable');
  const view = render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.getByText('Loaded oak boards')).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the related billing overview.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry billing lookup' }));
  expect(state.retryBilling).toHaveBeenCalledOnce();
  expect(state.retry).not.toHaveBeenCalled();
  state.billingError = undefined;
  state.transactionId = 7;
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.queryByText('Unable to load the related billing overview.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open billing overview' })).toBeTruthy();
});

it('keeps usage details visible while independently retrying failed operating duration', () => {
  state.canViewOperatingDuration = true;
  state.operatingDurationError = new Error('Unavailable');
  const view = render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.getByText('Cleaned the machine')).toBeTruthy();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to load machine running time.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry machine running time' }));
  expect(state.retryOperatingDuration).toHaveBeenCalledOnce();
  expect(state.retry).not.toHaveBeenCalled();
  state.operatingDurationError = undefined;
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(screen.queryByText('Unable to load machine running time.')).toBeNull();
});

it('shows zero running time for a recovered session without requesting an empty interval', () => {
  state.canViewOperatingDuration = true;
  state.operatingDurationError = new Error('Invalid interval');
  state.session = {
    ...session,
    isFinalized: false,
    endTime: session.startTime,
    endNotes:
      'Original note\n[Recovery: cancelled orphan unfinalized session; no confirmed end time, no duration or charge inferred.]',
  };
  render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);

  expect(state.fetchOperatingDuration).toHaveBeenLastCalledWith(2, false, {
    start: new Date(session.startTime),
    end: new Date(session.startTime),
  });
  expect(screen.getByText('Machine running time during this session')).toBeTruthy();
  expect(screen.getByText('0m')).toBeTruthy();
  expect(screen.getByText(/Original note/)).toHaveTextContent('[Recovery: cancelled orphan unfinalized session');
  expect(screen.queryByRole('button', { name: 'Retry machine running time' })).toBeNull();
});

it('continues requesting operating duration for completed and ongoing sessions', () => {
  state.canViewOperatingDuration = true;
  const view = render(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(state.fetchOperatingDuration).toHaveBeenLastCalledWith(2, true, {
    start: new Date(session.startTime),
    end: new Date('2026-09-01T11:00:00Z'),
  });

  state.session = { ...session, endTime: null };
  view.rerender(<UsageNotesModal isOpen resourceId={2} usageId={8} onClose={vi.fn()} />);
  expect(state.fetchOperatingDuration).toHaveBeenLastCalledWith(2, true, undefined);
});
