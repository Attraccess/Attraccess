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
}));

vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetPairings: () => ({ data: mocks.pairings.current }),
  useAttractapServiceRequestReaderPairing: (options: { onSuccess?: (r: unknown, v: unknown) => void }) => {
    mocks.requestOptions.current = options;
    return { mutate: mocks.requestPairing, isPending: false, variables: undefined };
  },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (value: string) => `at ${value}`,
}));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => mocks.toast }));
vi.mock('../../../components/standardModal', () => ({
  StandardModal: ({
    children,
    isOpen,
  }: {
    children: (r: { close: () => void }) => React.ReactNode;
    isOpen: boolean;
  }) => (isOpen ? <div>{children({ close: vi.fn() })}</div> : null),
}));
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
  state: 'announced',
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
    Object.values(mocks.toast).forEach((fn) => fn.mockClear());
  });

  it('is hidden when every reader is paired and no device waits', () => {
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'paired')]} />);
    expect(document.querySelector('[data-cy="attractap-readers-to-pair"]')).toBeNull();
  });

  it('lists every reader that is not paired the same way, with nothing but a Pair button', () => {
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
        .map((b) => b.textContent),
    ).toEqual(['toPair.pair', 'toPair.pair', 'toPair.pair']);
  });

  it('pairs a reader whose pairing was removed with a reader the admin picks', async () => {
    const user = userEvent.setup();
    mocks.pairings.current = [pairing('dev')];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(3, 'revoked')]} />);
    await user.click(document.querySelector('[data-cy="attractap-pair-reader-3"]') as HTMLElement);
    expect(mocks.requestPairing).not.toHaveBeenCalled();
    const picker = document.querySelector('[data-cy="attractap-device-picker"]') as HTMLElement;
    await user.click(within(picker).getByRole('button', { name: 'picker.use' }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pairingId: 'dev', autoStartMode: 'repair', presetTargetReaderId: 3 }),
    );
  });

  it('hands the paired reader to the list and closes the dialog', () => {
    mocks.pairings.current = [pairing('dev')];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[]} />);
    const { onPaired } = mocks.pairingDialog.mock.lastCall?.[0] as { onPaired: (id: number) => void };
    act(() => onPaired(9));
    expect(mocks.onPaired).toHaveBeenCalledWith(9);
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ pairingId: null }));
  });

  it('asks a token reader to pair and opens its pairing once the reader connects', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);

    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    expect(mocks.requestPairing).toHaveBeenCalledWith({ readerId: 1 });
    act(() => mocks.requestOptions.current?.onSuccess?.({ requested: true }, { readerId: 1 }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ pairingId: null }));

    mocks.pairings.current = [pairing('p1', { boundReaderId: 1 })];
    rerender(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pairingId: 'p1', autoStartMode: 'pair' }),
    );
  });

  it('tells the admin when the reader is offline', async () => {
    const user = userEvent.setup();
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    act(() => mocks.requestOptions.current?.onSuccess?.({ requested: false }, { readerId: 1 }));
    expect(mocks.toast.error).toHaveBeenCalledWith({ title: 'toPair.notConnected' });
  });

  it('lets a waiting device choose its mode in the dialog', async () => {
    const user = userEvent.setup();
    mocks.pairings.current = [pairing('dev')];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[]} />);
    await user.click(screen.getByRole('button', { name: 'toPair.pair' }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pairingId: 'dev', autoStartMode: undefined }),
    );
  });

  it('offers Continue for a pairing that already runs', () => {
    mocks.pairings.current = [pairing('p1', { boundReaderId: 1, mode: 'pair', state: 'awaiting-confirmation' })];
    render(<ReadersToPair onPaired={mocks.onPaired} readers={[reader(1, 'unpaired')]} />);
    expect(screen.getByRole('button', { name: 'toPair.resume' })).toBeInTheDocument();
  });
});
