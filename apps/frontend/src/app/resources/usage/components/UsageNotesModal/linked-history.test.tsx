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
}));
vi.mock('../../hooks/useUsageSessionProject', () => ({ useUsageSessionProject: () => ({ updatingSessionIds: {} }) }));
vi.mock('../../../operatingDuration', () => ({
  useCanViewOperatingDuration: () => false,
  useOperatingDuration: () => ({}),
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
    return { data: { transactionId: state.transactionId } };
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
