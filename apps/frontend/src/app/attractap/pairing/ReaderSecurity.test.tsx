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
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
  useDateTimeFormatter: () => (value: string) => `at ${value}`,
  AttraccessUser: ({ user }: { user: { username: string } }) => <span>{user.username}</span>,
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
  state: 'announced',
  kind,
  boundReaderId: null,
  targetReaderId: null,
  mode: null,
  keyFingerprint: `key-${id}`,
  createdAt,
  expiresAt: null,
  code: null,
  readerConfirmed: false,
  adminConfirmed: false,
  failureReason: null,
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
    render(<ReaderSecurity reader={reader} />);

    await user.click(screen.getByRole('button', { name: 'security.revoke' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('security.revokeMessage')).toBeInTheDocument();
    expect(mocks.revoke).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'security.revoke' }));
    expect(mocks.revoke).toHaveBeenCalledWith({ readerId: 7 });

    act(() => mocks.revokeOptions.current?.onSuccess?.());
    expect(mocks.toast.success).toHaveBeenCalledWith({ title: 'security.revoked' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('lets the admin choose which waiting device re-pairs the reader', async () => {
    const user = userEvent.setup();
    mocks.pairings.current = [
      waitingDevice('a', 'touch', '2026-10-30T07:00:00.000Z'),
      waitingDevice('b', 'lite', '2026-10-30T07:05:00.000Z'),
    ];
    render(<ReaderSecurity reader={reader} />);

    await user.click(screen.getByRole('button', { name: 'security.repair' }));
    const picker = document.querySelector('[data-cy="attractap-security-device-picker"]') as HTMLElement;
    expect(within(picker).getByText('device.kind.touch')).toBeInTheDocument();
    expect(within(picker).getByText('device.kind.lite')).toBeInTheDocument();
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(expect.objectContaining({ pairingId: null }));

    await user.click(within(picker).getAllByRole('button', { name: 'security.chooseDevice.use' })[1]);
    expect(mocks.pairingDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ pairingId: 'b', autoStartMode: 'repair', presetTargetReaderId: 7 }),
    );
  });

  it('shows who paired the reader and the actor and certificate of every history entry', () => {
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
    render(<ReaderSecurity reader={reader} />);
    const pairedBy = document.querySelector('[data-cy="attractap-security-paired-by"]') as HTMLElement;
    expect(pairedBy).toHaveTextContent('user-3');
    expect(screen.getAllByText('user-3')).toHaveLength(2);
    expect(screen.getByText('security.certificateSerial')).toBeInTheDocument();
  });

  it('shows Waiting to pair while a pairing for this reader runs', () => {
    mocks.pairings.current = [{ ...waitingDevice('c', 'touch', '2026-10-30T07:00:00.000Z'), targetReaderId: 7 }];
    render(<ReaderSecurity reader={reader} />);
    expect(document.querySelector('[data-cy="attractap-pairing-state-waiting"]')).not.toBeNull();
  });

  it('shows the stored state when the pairing for this reader ended', () => {
    mocks.pairings.current = [
      { ...waitingDevice('c', 'touch', '2026-10-30T07:00:00.000Z'), boundReaderId: 7, state: 'failed' },
    ];
    render(<ReaderSecurity reader={reader} />);
    expect(document.querySelector('[data-cy="attractap-pairing-state-paired"]')).not.toBeNull();
  });

  it('explains every action next to its button', () => {
    render(<ReaderSecurity reader={reader} />);
    for (const key of ['repair', 'replace', 'revoke']) {
      expect(screen.getByRole('button', { name: `security.${key}` })).toBeInTheDocument();
      expect(screen.getByText(`security.${key}Description`)).toBeInTheDocument();
    }
  });

  it('offers no actions for a reader that still signs in with its token; it is paired from the list', () => {
    render(<ReaderSecurity reader={{ ...reader, pairingState: 'unpaired' } as Attractap} />);
    expect(screen.getByText('security.unpairedHint')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
