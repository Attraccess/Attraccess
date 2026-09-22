import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TransactionDetailsModal } from './index';
const state = vi.hoisted(() => ({
  transaction: undefined as Record<string, unknown> | undefined,
  configuration: undefined as { minorUnit: number } | undefined,
  refund: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBillingServiceGetBillingTransaction: () => ({ data: state.transaction }),
  useBillingServiceGetBillingConfiguration: () => ({ data: state.configuration }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: (key: string) => key === 'items.system.usage' }),
  useNumberFormatter: () => (value: number) => value.toFixed(2),
  DateTimeDisplay: ({ date }: { date: string }) => <span>{date}</span>,
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
}));
vi.mock('./refund', () => ({
  RefundModal: ({ children }: { children: (open: () => void) => ReactNode }) => children(state.refund),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.transaction = undefined;
  state.configuration = undefined;
});
afterEach(cleanup);
it('opens through its trigger and shows loading until data arrives', async () => {
  render(
    <TransactionDetailsModal transactionId={7}>
      {(open) => <button onClick={open}>Open transaction</button>}
    </TransactionDetailsModal>,
  );
  expect(screen.queryByText('loading')).toBeNull();
  fireEvent.click(screen.getByText('Open transaction'));
  expect(await screen.findByText('loading')).toBeTruthy();
});
it('shows usage charges, item totals and refund action using minor currency units', async () => {
  state.transaction = {
    id: 7,
    createdAt: '2026-01-02',
    status: 'completed',
    amount: -750,
    resourceUsageId: 8,
    resourceUsage: { id: 8, resource: { name: 'Lathe' } },
    initiator: { username: 'Ada' },
    items: [
      {
        id: 1,
        name: 'usage',
        description: 'Machine time',
        quantity: 3,
        unitPrice: 250,
        externalReference: 'usage-item-1',
      },
      { id: 2, name: 'Custom fee', description: 'Setup', quantity: 1, unitPrice: 100 },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('type.resourceUsage')).toBeTruthy();
  expect(screen.getByText('-7.50')).toBeTruthy();
  expect(screen.getByText('Lathe')).toBeTruthy();
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(screen.getByText('items.system.usage')).toBeTruthy();
  expect(screen.getByText('Custom fee')).toBeTruthy();
  expect(screen.getByText('usage-item-1')).toBeTruthy();
  expect(screen.getByText('8.50')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.refund' }));
  expect(state.refund).toHaveBeenCalledOnce();
});
it.each([
  ['refund', { refundOfId: 4, amount: 100, status: 'pending' }, 'type.refund'],
  ['manual', { initiatorId: 2, amount: 100, status: 'failed' }, 'type.manual'],
  ['topup', { externalReference: 'sumup_topup_transaction-9', amount: 100, status: 'completed' }, 'type.sumupTopup'],
  ['unknown', { amount: 0, status: 'unknown' }, 'type.unknown'],
])('classifies %s transactions and handles empty item lists', async (_name, fields, label) => {
  state.configuration = { minorUnit: 0 };
  state.transaction = { id: 7, createdAt: '2026-01-02', ...fields };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.getByText('items.empty')).toBeTruthy();
  expect(screen.getByText('status.' + fields.status)).toBeTruthy();
  if (fields.amount > 0) expect(screen.getByText('+100.00')).toBeTruthy();
});
it('falls back to usage ID and closes when the controlled open flag changes', async () => {
  state.transaction = {
    id: 7,
    resourceUsageId: 8,
    resourceUsage: { id: 8 },
    status: 'completed',
    amount: -100,
    items: [],
  };
  const closed = vi.fn();
  const view = render(<TransactionDetailsModal transactionId={7} isOpen onClose={closed} />);
  expect(await screen.findByText('Usage #8')).toBeTruthy();
  view.rerender(<TransactionDetailsModal transactionId={7} isOpen={false} onClose={closed} />);
  expect(closed).toHaveBeenCalled();
});
