import '@testing-library/jest-dom/vitest';
import React, { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AttractapService } from '@attraccess/react-query-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PairingDialog } from './PairingDialog';

// The ways an admin gets a reader's code into the dialog, end to end through real React Query and the
// real generated hooks under StrictMode (as in the app); only the API calls are stubbed.

vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => {
  const en = (await import('./en.json')).default;
  const t = (key: string, vars?: Record<string, unknown>) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
    if (typeof value !== 'string') return key;
    return value.replace(/{{(\w+)}}/g, (_, name: string) => String(vars?.[name] ?? ''));
  };
  return {
    ...(await importOriginal<object>()),
    useTranslations: () => ({ t }),
    useDateTimeFormatter: () => (value: string) => `at ${value}`,
    AlertStatusIcon: () => null,
    StandardModal: ({ children, isOpen }: { children: () => React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div>{children()}</div> : null,
  };
});
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../resourceOverview/toolbar/scanner', () => ({
  ResourceScanner: ({ children }: { children: (open: () => void) => React.ReactNode }) => <>{children(() => undefined)}</>,
}));

const waiting = {
  id: 'p1',
  state: 'waiting',
  kind: 'touch',
  firmware: { name: 'attractap', variant: 'touch-v2', version: '1.8.0' },
  boundReaderId: null,
  targetReaderId: null,
  mode: null,
  createdAt: '2026-10-31T07:00:00.000Z',
  expiresAt: '2026-10-31T07:10:00.000Z',
  failureReason: null,
};

function stubApi() {
  // CancelablePromise is a Promise subtype; plain promises are enough for the hooks.
  const ok = <T,>(value: T) => Promise.resolve(value) as never;
  vi.spyOn(AttractapService, 'getPairings').mockImplementation(() => ok([waiting]));
  vi.spyOn(AttractapService, 'getPairing').mockImplementation(() => ok(waiting));
  vi.spyOn(AttractapService, 'getReaders').mockImplementation(() => ok([]));
  vi.spyOn(AttractapService, 'cancelPairing').mockImplementation(() => ok(undefined));
  const resolve = vi.spyOn(AttractapService, 'resolvePairing').mockImplementation(() => ok(waiting));
  const approve = vi
    .spyOn(AttractapService, 'approvePairing')
    .mockImplementation(() => ok({ ...waiting, state: 'completed', mode: 'new', targetReaderId: 12 }));
  return { resolve, approve };
}

function openDialog(props: Partial<React.ComponentProps<typeof PairingDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onPaired = vi.fn();
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <PairingDialog isOpen onClose={vi.fn()} onPaired={onPaired} {...props} />
      </QueryClientProvider>
    </StrictMode>,
  );
  return { onPaired };
}

const openWithCode = (presetCode: string, via?: 'flasher') => openDialog({ presetCode, via });

async function approveAndExpectPaired(api: ReturnType<typeof stubApi>, onPaired: ReturnType<typeof vi.fn>) {
  const approveButton = await screen.findByRole('button', { name: 'Approve' });
  await waitFor(() => expect(approveButton).toBeEnabled());
  await userEvent.click(approveButton);
  await waitFor(() => expect(api.approve).toHaveBeenCalledTimes(1));
  expect(api.approve).toHaveBeenCalledWith({
    pairingId: 'p1',
    requestBody: expect.objectContaining({ code: 'K7P3XQ', mode: 'new' }),
  });
  await waitFor(() => expect(onPaired).toHaveBeenCalledWith(12));
}

describe('PairingDialog: every way to get the code in ends in an approval', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    // These look the reader up by themselves when the dialog opens.
    ['the enroll link', undefined],
    ['the web flasher', 'flasher' as const],
  ])('finds the reader and lets the admin approve it, opened from %s', async (_label, via) => {
    const api = stubApi();
    const { onPaired } = openWithCode('k7p-3xq', via);

    const approveButton = await screen.findByRole('button', { name: 'Approve' });
    expect(api.resolve).toHaveBeenCalledTimes(1);
    expect(api.resolve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } });
    await waitFor(() => expect(approveButton).toBeEnabled());

    await userEvent.click(approveButton);
    await waitFor(() => expect(api.approve).toHaveBeenCalledTimes(1));
    expect(api.approve).toHaveBeenCalledWith({
      pairingId: 'p1',
      requestBody: expect.objectContaining({ code: 'K7P3XQ', mode: 'new', ...(via ? { via } : {}) }),
    });
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(12));
  });

  describe('typed by hand (no camera, no link)', () => {
    it('Pair on a waiting reader: type the code, then approve', async () => {
      const api = stubApi();
      const { onPaired } = openDialog({ pairingId: 'p1' });

      expect(await screen.findByRole('button', { name: 'Approve' })).toBeDisabled();
      await userEvent.type(await screen.findByRole('textbox', { name: /code on the reader/i }), 'k7p 3xq');

      await approveAndExpectPaired(api, onPaired);
      expect(api.resolve).not.toHaveBeenCalled();
    });

    it('No reader known yet: type the code, Continue finds the reader, then approve', async () => {
      const api = stubApi();
      const { onPaired } = openDialog();

      await userEvent.type(await screen.findByRole('textbox', { name: /code on the reader/i }), 'K7P-3XQ');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(api.resolve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } }));

      await approveAndExpectPaired(api, onPaired);
    });
  });
});
