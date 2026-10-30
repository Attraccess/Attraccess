import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attractap } from '@attraccess/react-query-client';
import { ReaderSecurity } from './ReaderSecurity';

const mocks = vi.hoisted(() => ({
  pairings: { current: [] as unknown[] },
  history: { current: [] as unknown[] },
  revoke: vi.fn(),
  revokeOptions: { current: undefined as undefined | { onSuccess?: () => void } },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  pairingDialog: vi.fn(),
  pairingRemoved: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetPairings: () => ({ data: mocks.pairings.current }),
  useAttractapServiceGetReaderCredentialHistory: () => ({ data: mocks.history.current }),
  useAttractapServiceRevokeReader: (options: { onSuccess?: () => void }) => {
    mocks.revokeOptions.current = options;
    return { mutate: mocks.revoke, isPending: false };
  },
  useAttractapServiceGetReadersKey: 'readers',
  useAttractapServiceGetReaderCredentialHistoryKey: 'history',
  UseAttractapServiceGetReaderByIdKeyFn: () => ['reader'],
  useUsersServiceGetOneUserById: ({ id }: { id: number }) => ({ data: { id, username: `user-${id}` } }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (value: string) => `at ${value}`,
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
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

const reader = {
  id: 7,
  name: 'Door',
  pairingState: 'paired',
  credentialFingerprint: 'f'.repeat(64),
  pairedAt: '2026-10-01T10:00:00.000Z',
  certificateNotAfter: '2028-10-01T10:00:00.000Z',
} as unknown as Attractap;

const waitingDevice = (id: string, kind: 'touch' | 'lite', createdAt: string) => ({
  id,
  state: 'waiting',
  kind,
  boundReaderId: null,
  targetReaderId: null,
  mode: null,
  createdAt,
});

describe('ReaderSecurity', () => {
  beforeEach(() => {
    mocks.pairings.current = [];
    mocks.history.current = [];
    mocks.revoke.mockClear();
    mocks.pairingDialog.mockClear();
    Object.values(mocks.toast).forEach((fn) => fn.mockClear());
  });

  it('asks for confirmation in a danger dialog before revoking', async () => {
    const user = userEvent.setup();
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);

    await user.click(screen.getByRole('button', { name: 'security.revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('security.revokeMessage')).toBeInTheDocument();
    expect(mocks.revoke).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'security.revoke' }));
    expect(mocks.revoke).toHaveBeenCalledWith({ readerId: 7 });

    act(() => mocks.revokeOptions.current?.onSuccess?.());
    expect(mocks.toast.success).toHaveBeenCalledWith({ title: 'security.revoked' });
    // A reader without pairing cannot be edited, so the editor closes.
    expect(mocks.pairingRemoved).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('opens the pairing dialog with this reader preset as the one to take over', async () => {
    const user = userEvent.setup();
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: false }));

    await user.click(screen.getByRole('button', { name: 'security.repair' }));
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true, presetTargetReaderId: 7 }),
    );
  });

  it('shows who paired the reader and the history in plain words, without technical identifiers', () => {
    mocks.history.current = [
      {
        id: 2,
        state: 'paired',
        keyFingerprint: 'f'.repeat(64),
        certificateSerial: 'ab12',
        actorId: 3,
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 1,
        state: 'revoked',
        keyFingerprint: 'e'.repeat(64),
        certificateSerial: null,
        actorId: null,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ];
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);
    const pairedBy = document.querySelector('[data-cy="attractap-security-paired-by"]') as HTMLElement;
    expect(pairedBy).toHaveTextContent('user-3');
    expect(screen.getAllByText('user-3')).toHaveLength(2);
    expect(screen.getByText('security.event.revoked')).toBeInTheDocument();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('ffff');
    expect(text).not.toContain('ab12');
  });

  it('shows Waiting to pair while a pairing for this reader runs', () => {
    mocks.pairings.current = [{ ...waitingDevice('c', 'touch', '2026-10-30T07:00:00.000Z'), targetReaderId: 7 }];
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);
    expect(document.querySelector('[data-cy="attractap-pairing-state-waiting"]')).not.toBeNull();
  });

  it('shows the stored state when the pairing for this reader ended', () => {
    mocks.pairings.current = [
      { ...waitingDevice('c', 'touch', '2026-10-30T07:00:00.000Z'), boundReaderId: 7, state: 'failed' },
    ];
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);
    expect(document.querySelector('[data-cy="attractap-pairing-state-paired"]')).not.toBeNull();
  });

  it('explains every action next to its button', () => {
    render(<ReaderSecurity reader={reader} onPairingRemoved={mocks.pairingRemoved} />);
    for (const key of ['repair', 'revoke']) {
      expect(screen.getByRole('button', { name: `security.${key}` })).toBeInTheDocument();
      expect(screen.getByText(`security.${key}Description`)).toBeInTheDocument();
    }
    // A reset reader and a swapped-in reader are paired the same way, so there is one action for both.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
