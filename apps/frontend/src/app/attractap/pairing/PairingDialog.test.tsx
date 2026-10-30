import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PairingDialog } from './PairingDialog';

type Pairing = {
  id: string;
  state: string;
  kind: string;
  boundReaderId: number | null;
  targetReaderId: number | null;
  mode: string | null;
  keyFingerprint: string;
  createdAt: Date;
  expiresAt: Date;
  code: { kind: string; value: string | string[] } | null;
  readerConfirmed: boolean;
  adminConfirmed: boolean;
  failureReason: string | null;
};

const freshPairing = (): Pairing => ({
  id: 'p1',
  state: 'awaiting-confirmation',
  kind: 'touch',
  boundReaderId: null,
  targetReaderId: null,
  mode: 'new',
  keyFingerprint: 'abcd',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 240_000),
  code: { kind: 'digits', value: '471903' },
  readerConfirmed: false,
  adminConfirmed: false,
  failureReason: null,
});

const mocks = vi.hoisted(() => ({
  pairing: { current: undefined as unknown },
  pollingFailed: { current: false },
  pairingOptions: { current: undefined as unknown },
  start: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isIdle: true,
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

vi.mock('@attraccess/react-query-client', () => {
  const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isIdle: true, isPending: false, isError: false });
  return {
    useAttractapServiceGetPairing: (_params: unknown, _key: unknown, options: unknown) => {
      mocks.pairingOptions.current = options;
      return { data: mocks.pairing.current, isError: mocks.pollingFailed.current };
    },
    useAttractapServiceGetReaders: () => ({ data: [] }),
    useAttractapServiceGetReadersKey: 'readers',
    useAttractapServiceGetReaderByIdKey: 'reader-by-id',
    useAttractapServiceGetReaderCredentialHistoryKey: 'history',
    useAttractapServiceStartPairing: () => mocks.start,
    useAttractapServiceConfirmPairing: mutation,
    useAttractapServiceCancelPairing: mutation,
  };
});
vi.mock('@attraccess/plugins-frontend-ui', async () => {
  const en = (await import('./en.json')).default;
  const t = (key: string, vars?: Record<string, unknown>) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
    if (typeof value !== 'string') return key;
    return value.replace(/{{(\w+)}}/g, (_, name: string) => String(vars?.[name] ?? ''));
  };
  return { useTranslations: () => ({ t }) };
});
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ error: vi.fn() }) }));
vi.mock('../../../hooks/useNow', () => ({ useNow: () => new Date() }));
vi.mock('../../../components/AlertStatusIcon', () => ({ AlertStatusIcon: () => null }));
vi.mock('../../../components/select', () => ({ Select: () => null }));
vi.mock('../../../components/standardModal', () => ({
  StandardModal: ({ children, isOpen }: { children: () => React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children()}</div> : null,
}));

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

function setPairing(changes: Partial<Pairing>) {
  mocks.pairing.current = { ...freshPairing(), ...changes };
}

describe('PairingDialog', () => {
  beforeEach(() => {
    setPairing({});
    mocks.pollingFailed.current = false;
    Object.assign(mocks.start, { isIdle: true, isPending: false, isError: false, error: null });
    mocks.start.mutate.mockClear();
  });
  afterEach(() => setSecureContext(true));

  it('shows the six digit code and warns on a page that is not a secure context', () => {
    setSecureContext(false);
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(screen.getByText('471 903')).toBeInTheDocument();
    expect(document.querySelector('[data-cy="attractap-pairing-insecure-warning"]')).not.toBeNull();
  });

  it('shows no warning over HTTPS', () => {
    setSecureContext(true);
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(document.querySelector('[data-cy="attractap-pairing-insecure-warning"]')).toBeNull();
  });

  it('lists the translated colour names in segment order and hides the dots from screen readers', () => {
    setPairing({
      code: { kind: 'colours', value: ['red', 'green', 'blue', 'yellow', 'white', 'magenta', 'red', 'blue'] },
    });
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(screen.getByText('1 Red, 2 Green, 3 Blue, 4 Yellow, 5 White, 6 Magenta, 7 Red, 8 Blue')).toBeInTheDocument();
    const dots = document.querySelector('[data-cy="attractap-pairing-code"] [aria-hidden="true"]');
    expect(dots?.children).toHaveLength(8);
  });

  it('marks the countdown as a timer and announces the confirmation status politely', () => {
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(screen.getByRole('timer')).toHaveTextContent(/^Time left: \d:\d\d$/);
    expect(screen.getByText('Waiting for you to confirm').closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('refreshes the reader queries once the pairing completed', () => {
    setPairing({ state: 'completed' });
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['readers'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['reader-by-id'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['history'] });
  });

  it('explains why a pairing ended', () => {
    setPairing({ state: 'cancelled', failureReason: 'cancelled-at-reader' });
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(screen.getByText('Pairing was cancelled.')).toBeInTheDocument();
    expect(screen.getByText('It was cancelled at the reader.')).toBeInTheDocument();
    expect(screen.getByText('It was cancelled at the reader.').closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('stops polling once the pairing reached a terminal state', () => {
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    const { refetchInterval } = mocks.pairingOptions.current as {
      refetchInterval: (query: { state: { data?: { state: string } } }) => number | false;
    };
    expect(refetchInterval({ state: { data: { state: 'awaiting-confirmation' } } })).toBe(1000);
    expect(refetchInterval({ state: {} })).toBe(1000);
    for (const state of ['completed', 'failed', 'cancelled', 'expired']) {
      expect(refetchInterval({ state: { data: { state } } })).toBe(false);
    }
  });

  it('tells the admin when the server can no longer be reached', () => {
    mocks.pollingFailed.current = true;
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(document.querySelector('[data-cy="attractap-pairing-connection-lost"]')).not.toBeNull();
  });

  it('shows a spinner while the reader has not produced a code yet', () => {
    setPairing({ state: 'announced', code: null, expiresAt: undefined });
    render(<PairingDialog pairingId="p1" onClose={vi.fn()} />);
    expect(screen.getByText('Waiting for the reader…')).toBeInTheDocument();
  });

  it('starts an auto-start pairing once', () => {
    setPairing({ state: 'announced', mode: null, code: null });
    render(<PairingDialog pairingId="p1" autoStartMode="pair" onClose={vi.fn()} />);
    expect(mocks.start.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.start.mutate).toHaveBeenCalledWith({ pairingId: 'p1', requestBody: { mode: 'pair' } });
  });

  it('does not start again after the start failed and shows the error', () => {
    setPairing({ state: 'announced', mode: null, code: null });
    Object.assign(mocks.start, {
      isIdle: false,
      isError: true,
      error: Object.assign(new Error('Conflict'), { body: { message: 'Pairing already started' } }),
    });
    const { rerender } = render(<PairingDialog pairingId="p1" autoStartMode="pair" onClose={vi.fn()} />);
    rerender(<PairingDialog pairingId="p1" autoStartMode="pair" onClose={vi.fn()} />);
    expect(mocks.start.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Could not start pairing: Pairing already started')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for the reader…')).toBeNull();
    expect(document.querySelector('[data-cy="attractap-pairing-retry"]')).not.toBeNull();
  });
});
