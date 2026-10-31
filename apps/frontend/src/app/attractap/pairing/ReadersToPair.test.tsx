import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attractap } from '@attraccess/react-query-client';
import { ReadersToPair } from './ReadersToPair';

const mocks = vi.hoisted(() => ({
  pairings: { current: [] as unknown[] },
  requestPairing: vi.fn(),
  requestOptions: { current: undefined as undefined | { onSuccess?: (r: unknown, v: unknown) => void } },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pairingDialog: vi.fn(),
  onPaired: vi.fn(),
  navigate: vi.fn(),
  deleteModal: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../AttractapList/delete', () => ({
  AttractapDeleteModal: ({
    readerId,
    children,
  }: {
    readerId: number;
    children: (open: () => void) => React.ReactNode;
  }) => children(() => mocks.deleteModal(readerId)),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetPairings: () => ({ data: mocks.pairings.current }),
  useAttractapServiceRequestReaderPairing: (options: { onSuccess?: (r: unknown, v: unknown) => void }) => {
    mocks.requestOptions.current = options;
    return { mutate: mocks.requestPairing, isPending: false, variables: undefined };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (value: string) => `at ${value}`,
  PageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  ),
  StandardModal: ({
    children,
    isOpen,
  }: {
    children: (r: { close: () => void }) => React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div>{children({ close: vi.fn() })}</div> : null),
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => mocks.toast }));
vi.mock('./PairingDialog', () => ({
  PairingDialog: (props: unknown) => {
    mocks.pairingDialog(props);
    return null;
  },
}));

const reader = (id: number, pairingState: string, firmwareName = 'attractap_touch_v2') =>
  ({ id, name: `Reader ${id}`, pairingState, firmware: { name: firmwareName } }) as unknown as Attractap;

const pairing = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  state: 'waiting',
  kind: 'touch',
  boundReaderId: null,
  targetReaderId: null,
  mode: null,
  keyFingerprint: `key-${id}`,
  createdAt: '2026-10-30T07:00:00.000Z',
  ...overrides,
});

describe('ReadersToPair', () => {
  beforeEach(() => {
    mocks.pairings.current = [];
    mocks.requestPairing.mockClear();
    mocks.pairingDialog.mockClear();
    mocks.onPaired.mockClear();
    mocks.navigate.mockClear();
    mocks.deleteModal.mockClear();
    Object.values(mocks.toast).forEach((fn) => fn.mockClear());
  });

  it('is hidden when every reader is paired and no device waits', () => {
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'paired')]} />);
    expect(document.querySelector('[data-cy="attractap-readers-to-pair"]')).toBeNull();
  });

  it('lists every reader that is not paired the same way; only reader records can be deleted or diagnosed', () => {
    mocks.pairings.current = [pairing('dev', { kind: 'lite' })];
    render(
      <ReadersToPair
        onPaired={mocks.onPaired}
        readers={[reader(1, 'unpaired'), reader(2, 'paired'), reader(3, 'revoked', 'attractap_lite')]}
      />,
    );
    const card = document.querySelector('[data-cy="attractap-readers-to-pair"]') as HTMLElement;
    expect(within(card).getByText('Reader 1')).toBeInTheDocument();
    expect(within(card).queryByText('Reader 2')).toBeNull();
    expect(within(card).getByText('Reader 3')).toBeInTheDocument();
    expect(within(card).getByText('toPair.newReader')).toBeInTheDocument();
    // Every row has a type label; nothing technical such as the device key is shown.
    expect(
      within(card)
        .getAllByText(/^kind\./)
        .map((chip) => chip.textContent),
    ).toEqual(['kind.touch', 'kind.lite', 'kind.lite']);
    expect(card.textContent).not.toContain('key-dev');
    expect(
      within(card)
        .getAllByRole('button')
        .map((b) => b.textContent || b.getAttribute('aria-label')),
    ).toEqual([
      'toPair.pair',
      'toPair.diagnostics',
      'toPair.delete',
      'toPair.pair',
      'toPair.diagnostics',
      'toPair.delete',
      'toPair.pair',
    ]);
  });

  it('deletes a reader record that is not paired', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.delete' }));
    expect(mocks.deleteModal).toHaveBeenCalledWith(1);
  });

  it('opens the diagnostics of a reader record that is not paired', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(3, 'revoked')]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.diagnostics' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/attractap/readers/3/diagnostics');
  });

  it('lets a reader whose pairing was removed take over its own record', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(3, 'revoked')]} />);
    await user.click(document.querySelector('[data-cy="attractap-pair-reader-3"]') as HTMLElement);
    expect(mocks.requestPairing).not.toHaveBeenCalled();
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true, presetTargetReaderId: 3 }),
    );
  });

  it('hands the paired reader to the list and closes the dialog', async () => {
    const user = userEvent.setup();
    mocks.pairings.current = [pairing('dev')];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    const { onPaired } = mocks.pairingDialog.mock.lastCall?.[0] as { onPaired: (id: number) => void };
    act(() => onPaired(9));
    expect(mocks.onPaired).toHaveBeenCalledWith(9);
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: false }));
  });

  it('asks a token reader to pair and lets the dialog wait for it', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);

    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    expect(mocks.requestPairing).toHaveBeenCalledWith({ readerId: 1 });
    act(() => mocks.requestOptions.current?.onSuccess?.({ requested: true }, { readerId: 1 }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, waitForReaderId: 1 }));
  });

  it('tells the admin when the reader is offline', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    act(() => mocks.requestOptions.current?.onSuccess?.({ requested: false }, { readerId: 1 }));
    expect(mocks.toast.error).toHaveBeenCalledWith({ title: 'toPair.notConnected' });
  });

  it('opens a waiting new reader by its request, without any code', async () => {
    const user = userEvent.setup();
    mocks.pairings.current = [pairing('dev')];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, pairingId: 'dev' }));
  });

  it('offers Continue for a pairing that already runs', () => {
    mocks.pairings.current = [pairing('p1', { boundReaderId: 1, state: 'waiting' })];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    expect(screen.getByRole('button', { name: 'toPair.resume' })).toBeInTheDocument();
  });
});
