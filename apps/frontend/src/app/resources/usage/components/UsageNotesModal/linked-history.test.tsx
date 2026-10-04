import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
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
  billingTransaction: { id: 7 },
} as ResourceUsage;
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<typeof import('@attraccess/react-query-client')>()),
  useBillingServiceGetBillingTransaction: () => ({
    data: { id: 7, createdAt: '2026-09-01', status: 'completed', amount: -500, items: [], resourceUsage: session },
  }),
  useBillingServiceGetBillingConfiguration: () => ({ data: { minorUnit: 2 } }),
}));
vi.mock('../../../../billing/dashboard/summary/transactionDetailsModal/refund', () => ({ RefundModal: () => null }));
afterEach(cleanup);

it('opens the billing modal from usage and returns to the original usage drawer without navigating', async () => {
  render(<UsageNotesModal isOpen session={session} onClose={vi.fn()} />);
  const url = window.location.href;
  fireEvent.click(screen.getByRole('button', { name: 'Open billing overview' }));
  expect(await screen.findByText('Transaction details')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open usage details' }));
  const dialogs = screen.getAllByRole('dialog');
  expect(within(dialogs[dialogs.length - 1]).getByText('Loaded oak boards')).toBeTruthy();
  expect(within(dialogs[dialogs.length - 1]).getByText('Workshop shelves')).toBeTruthy();
  fireEvent.click(within(dialogs[dialogs.length - 1]).getByRole('button', { name: 'Open billing overview' }));
  expect(screen.getByText('Transaction details')).toBeTruthy();
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
  const view = render(<UsageNotesModal isOpen session={{ ...session, billingTransaction: null }} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Open billing overview' })).toBeNull();
  view.rerender(<UsageNotesModal isOpen session={{ ...session, userId: 2 }} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Open billing overview' })).toBeNull();
});
