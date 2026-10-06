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
  useTranslationState: () => ({ language: 'de' }),
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
  expect(screen.getByText('-7,5')).toBeTruthy();
  expect(screen.getByText('Lathe')).toBeTruthy();
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(screen.getByText('items.system.usage')).toBeTruthy();
  expect(screen.getByText('Custom fee')).toBeTruthy();
  expect(screen.getByText('usage-item-1')).toBeTruthy();
  expect(screen.getByText('8,5')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'actions.refund' }));
  expect(state.refund).toHaveBeenCalledOnce();
});
it('renders a migrated energy item through generic quantity and rate fields', async () => {
  state.transaction = {
    id: 7,
    resourceUsageId: 8,
    resourceUsage: { id: 8 },
    status: 'completed',
    amount: -45,
    items: [
      {
        id: 1,
        name: 'Energy (kWh)',
        description: null,
        quantity: 1,
        unitPrice: 45,
        meterQuantity: '1.5',
        meterCreditsPerUnit: 30,
        externalReference: 'metering:s:o',
      },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('items.meterDescription')).toBeTruthy();
  expect(screen.getByText('Energy (kWh)')).toBeTruthy();
  expect(screen.queryByText('metering:s:o')).toBeNull();
  // quantity/unit price columns show the real kWh consumed and per-kWh rate,
  // not the raw quantity=1 / unitPrice=total-charge fields (ATT-1103).
  expect(screen.getByText('1,5')).toBeTruthy();
  expect(screen.getByText('0,3')).toBeTruthy();
});
it.each([
  ['refund', { refundOfId: 4, amount: 100, status: 'pending' }, 'type.refund'],
  ['correction', { correctionOfId: 4, initiatorId: 2, amount: -45, status: 'completed' }, 'type.correction'],
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
  if (fields.amount > 0) expect(screen.getByText('+100')).toBeTruthy();
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

it('preserves generic meter precision and user names that match system labels', async () => {
  state.transaction = {
    id: 7,
    status: 'completed',
    amount: -45,
    items: [
      {
        id: 1,
        name: 'usage',
        quantity: 1,
        unitPrice: 45,
        meterQuantity: '9007199254740993.123456789',
        meterCreditsPerUnit: 30,
      },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('9.007.199.254.740.993,123456789')).toBeTruthy();
  expect(screen.getByText('usage')).toBeTruthy();
  expect(screen.queryByText('items.system.usage')).toBeNull();
  expect(screen.getByText('0,3')).toBeTruthy();
});

it('preserves every cent in a large captured meter rate', async () => {
  state.transaction = {
    id: 7,
    status: 'completed',
    amount: 0,
    items: [
      {
        id: 1,
        name: 'Heartbeats',
        quantity: 1,
        unitPrice: 0,
        meterQuantity: '0',
        meterCreditsPerUnit: Number.MAX_SAFE_INTEGER,
      },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('90.071.992.547.409,91')).toBeTruthy();
});

it('preserves exact nonzero subtotals, aggregate totals and the settled amount', async () => {
  state.transaction = {
    id: 7,
    status: 'completed',
    amount: -Number.MAX_SAFE_INTEGER,
    items: [
      {
        id: 1,
        name: 'Heartbeats',
        quantity: 1,
        unitPrice: Number.MAX_SAFE_INTEGER - 2,
        meterQuantity: '1',
        meterCreditsPerUnit: 1,
      },
      { id: 2, name: 'Additional fee', quantity: 2, unitPrice: 1 },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('-90.071.992.547.409,91')).toBeTruthy();
  expect(screen.getByText('90.071.992.547.409,89')).toBeTruthy();
  expect(screen.getByText('90.071.992.547.409,91')).toBeTruthy();
});

it('distinguishes unavailable final evidence from a free zero reading and system labels', async () => {
  state.transaction = {
    id: 7,
    status: 'completed',
    amount: 0,
    items: [
      {
        id: 1,
        name: 'usage',
        quantity: 1,
        unitPrice: 0,
        meterQuantity: null,
        meterCreditsPerUnit: 17,
        externalReference: 'metering:session:unavailable',
      },
      { id: 2, name: 'Free Heartbeats', quantity: 1, unitPrice: 0, meterQuantity: '0', meterCreditsPerUnit: 0 },
    ],
  };
  render(<TransactionDetailsModal transactionId={7} isOpen />);
  expect(await screen.findByText('items.unavailable')).toBeTruthy();
  expect(screen.getAllByText('items.meterUnavailable').length).toBeGreaterThan(0);
  expect(screen.getByText('usage')).toBeTruthy();
  expect(screen.queryByText('items.system.usage')).toBeNull();
  expect(screen.queryByText('metering:session:unavailable')).toBeNull();
  expect(screen.getByText('0,17')).toBeTruthy();
  expect(screen.getByText('Free Heartbeats')).toBeTruthy();
  const freeRow = screen.getByText('Free Heartbeats').closest('tr');
  expect(freeRow?.querySelectorAll('td')[2].textContent).toBe('0');
  expect(freeRow?.querySelectorAll('td')[3].textContent).toBe('0');
});
