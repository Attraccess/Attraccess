import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PairingDialog, PairingDialogProps } from './PairingDialog';

type Pairing = Record<string, unknown>;

const waiting = (overrides: Pairing = {}): Pairing => ({
  id: 'p1',
  state: 'waiting',
  kind: 'touch',
  firmware: { name: 'attractap', variant: 'touch', version: '1.2.3' },
  boundReaderId: null,
  targetReaderId: null,
  mode: null,
  createdAt: '2026-10-30T07:00:00.000Z',
  expiresAt: '2026-10-30T07:10:00.000Z',
  failureReason: null,
  ...overrides,
});

const lite = (round: number, pattern?: string[]): Pairing =>
  waiting({
    kind: 'lite',
    round,
    pattern: pattern ?? ['red', 'green', 'blue', 'yellow', 'white', 'magenta', 'red', 'blue'],
  });

const mocks = vi.hoisted(() => ({
  pairing: { current: undefined as unknown },
  pairings: { current: [] as unknown[] },
  refetchResult: { current: undefined as unknown },
  refetch: vi.fn(),
  approve: vi.fn(),
  approveOptions: { current: undefined as undefined | Record<string, (value: unknown) => unknown> },
  resolve: vi.fn(),
  resolveOptions: { current: undefined as undefined | Record<string, (value: unknown) => unknown> },
  toast: { success: vi.fn(), error: vi.fn() },
  onDetected: { current: undefined as undefined | ((raw: string) => boolean) },
  pairingOptions: { current: undefined as unknown },
  invalidateQueries: vi.fn(() => Promise.resolve()),
  readers: { current: [] as unknown[] },
  selects: [] as Array<{ items: Array<{ key: string; label: string }>; onChange?: (key: string) => void }>,
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceGetPairing: (_params: unknown, _key: unknown, options: unknown) => {
    mocks.pairingOptions.current = options;
    return { data: mocks.pairing.current, isError: false, refetch: mocks.refetch };
  },
  useAttractapServiceGetPairings: () => ({ data: mocks.pairings.current }),
  useAttractapServiceGetReaders: () => ({ data: mocks.readers.current }),
  useAttractapServiceApprovePairing: (options: Record<string, (value: unknown) => unknown>) => {
    mocks.approveOptions.current = options;
    return { mutate: mocks.approve, isPending: false };
  },
  useAttractapServiceResolvePairing: (options: Record<string, (value: unknown) => unknown>) => {
    mocks.resolveOptions.current = options;
    return { mutate: mocks.resolve, isPending: false };
  },
  useAttractapServiceGetReadersKey: 'readers',
  useAttractapServiceGetReaderByIdKey: 'reader-by-id',
  useAttractapServiceGetReaderCredentialHistoryKey: 'history',
  useAttractapServiceGetPairingsKey: 'pairings',
}));
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
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => mocks.toast }));
vi.mock('../../../components/select', () => ({
  Select: (props: (typeof mocks.selects)[number]) => {
    mocks.selects.push(props);
    return null;
  },
}));
vi.mock('../../resourceOverview/toolbar/scanner', () => ({
  ResourceScanner: ({
    children,
    onDetected,
  }: {
    children: (open: () => void) => React.ReactNode;
    onDetected: (raw: string) => boolean;
  }) => {
    mocks.onDetected.current = onDetected;
    return <>{children(() => undefined)}</>;
  },
}));

function setSecureContext(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

function open(props: Partial<PairingDialogProps> = {}) {
  const onClose = vi.fn();
  const onPaired = vi.fn();
  render(<PairingDialog isOpen onClose={onClose} onPaired={onPaired} {...props} />);
  return { onClose, onPaired };
}

const approveButton = () => screen.getByRole('button', { name: 'Approve' });
const type = (text: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: /code on the reader/i }), { target: { value: text } });
const apiError = (status: number, body: Record<string, unknown>) => Object.assign(new Error('x'), { status, body });

describe('PairingDialog', () => {
  beforeEach(() => {
    setSecureContext(true);
    mocks.pairing.current = waiting();
    mocks.pairings.current = [];
    mocks.readers.current = [
      { id: 7, name: 'Door', pairingState: 'paired' },
      { id: 8, name: 'Old token reader', pairingState: 'unpaired' },
    ];
    mocks.selects.length = 0;
    mocks.refetchResult.current = undefined;
    mocks.refetch
      .mockReset()
      .mockImplementation(async () => ({ data: mocks.refetchResult.current ?? mocks.pairing.current }));
    for (const fn of [mocks.approve, mocks.resolve, mocks.toast.success, mocks.toast.error]) fn.mockClear();
  });
  afterEach(() => setSecureContext(true));

  describe('secure context', () => {
    it('offers the camera and no warning on a secure page', () => {
      open({ pairingId: 'p1' });
      expect(screen.getByRole('button', { name: /scan/i })).toBeInTheDocument();
      expect(document.querySelector('[data-cy="attractap-pairing-insecure-warning"]')).toBeNull();
    });

    it('warns on plain HTTP, hides the camera, and still lets the admin approve', () => {
      setSecureContext(false);
      open({ pairingId: 'p1' });
      expect(document.querySelector('[data-cy="attractap-pairing-insecure-warning"]')).not.toBeNull();
      expect(screen.queryByRole('button', { name: /scan/i })).toBeNull();
      type('k7p 3xq');
      expect(approveButton()).toBeEnabled();
    });

    it('fills the code from a scanned link', () => {
      open({ pairingId: 'p1' });
      let handled = false;
      act(() => {
        handled = mocks.onDetected.current?.('https://att.example/?enroll=K7P3XQ') ?? false;
      });
      expect(handled).toBe(true);
      expect(document.querySelector('[data-cy="attractap-pairing-code-input"]')).toHaveValue('K7P-3XQ');
      let other = true;
      act(() => {
        other = mocks.onDetected.current?.('https://att.example/resources') ?? true;
      });
      expect(other).toBe(false);
    });
  });

  describe('code step (touch)', () => {
    it('needs a valid code and accepts any case, spaces and no hyphen', async () => {
      open({ pairingId: 'p1' });
      expect(approveButton()).toBeDisabled();
      type('k7p');
      expect(approveButton()).toBeDisabled();
      type('k7p 3xq');
      expect(approveButton()).toBeEnabled();
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'new', code: 'K7P3XQ' },
      });
    });

    it('pairs a token reader with its own record and skips the question what the reader is', async () => {
      mocks.pairing.current = waiting({ boundReaderId: 4 });
      open({ pairingId: 'p1' });
      expect(screen.queryByText('What is this reader?')).toBeNull();
      type('K7P-3XQ');
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'pair', code: 'K7P3XQ' },
      });
    });

    it('asks whether the reader is new or takes over one, and offers the name only for a new reader', () => {
      open({ pairingId: 'p1' });
      expect(screen.getByText('What is this reader?')).toBeInTheDocument();
      expect(document.querySelector('[data-cy="attractap-pairing-name"]')).not.toBeNull();
    });

    it('sends the name of a new reader', async () => {
      open({ pairingId: 'p1' });
      await userEvent.type(document.querySelector('[data-cy="attractap-pairing-name"]') as HTMLElement, ' Laser ');
      type('K7P3XQ');
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'new', name: 'Laser', code: 'K7P3XQ' },
      });
    });

    it('takes over the preset reader', async () => {
      mocks.pairings.current = [];
      open({ presetCode: 'K7P-3XQ', presetTargetReaderId: 7 });
      expect(mocks.resolve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } });
      act(() => mocks.resolveOptions.current?.onSuccess?.(waiting()));
      expect(screen.getByText(/Reader found for code K7P-3XQ/)).toBeInTheDocument();
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'takeover', targetReaderId: 7, code: 'K7P3XQ' },
      });
    });

    it('on success shows a toast and hands over the paired reader', async () => {
      const { onPaired } = open({ pairingId: 'p1' });
      await act(async () => {
        await mocks.approveOptions.current?.onSuccess?.(waiting({ state: 'completed', targetReaderId: 9 }));
      });
      expect(mocks.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reader paired' }));
      expect(onPaired).toHaveBeenCalledWith(9);
    });

    it('says the reader was paired again when it took over a record', async () => {
      open({ pairingId: 'p1', presetTargetReaderId: 9 });
      await act(async () => {
        await mocks.approveOptions.current?.onSuccess?.(waiting({ state: 'completed', targetReaderId: 9 }));
      });
      expect(mocks.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reader paired again' }));
    });
  });

  describe('errors', () => {
    it('says a wrong code is wrong', () => {
      open({ pairingId: 'p1' });
      type('K7P3XQ');
      act(() => mocks.approveOptions.current?.onError?.(apiError(404, { message: 'PairingCodeNotFound' })));
      expect(screen.getByText(/does not match the reader/)).toBeInTheDocument();
    });

    it('shows Too many attempts with the wait time', () => {
      open({ pairingId: 'p1' });
      act(() =>
        mocks.approveOptions.current?.onError?.(
          apiError(429, { message: 'EnrollmentRateLimited', retryAfterSeconds: 42 }),
        ),
      );
      expect(screen.getByText('Too many attempts. Try again in 42 seconds.')).toBeInTheDocument();
    });

    it('shows Too many attempts without a wait time', () => {
      open({ pairingId: 'p1' });
      act(() => mocks.approveOptions.current?.onError?.(apiError(429, { message: 'EnrollmentRateLimited' })));
      expect(screen.getByText('Too many attempts. Wait a moment and try again.')).toBeInTheDocument();
    });

    it('explains an unknown code and an ambiguous code when looking up', () => {
      open({ presetCode: 'K7P3XQ' });
      act(() => mocks.resolveOptions.current?.onError?.(apiError(404, { message: 'PairingCodeNotFound' })));
      expect(screen.getByText(/No waiting reader shows this code/)).toBeInTheDocument();
      act(() => mocks.resolveOptions.current?.onError?.(apiError(409, { message: 'PairingCodeAmbiguous' })));
      expect(screen.getByText(/Two readers show this code/)).toBeInTheDocument();
    });

    it('explains why a request ended', () => {
      mocks.pairing.current = waiting({ state: 'failed', failureReason: 'cancelled-at-reader' });
      open({ pairingId: 'p1' });
      expect(screen.getByText('It was cancelled at the reader.')).toBeInTheDocument();
      expect(approveButton).toThrow();
    });
  });

  describe('Lite pattern step', () => {
    beforeEach(() => {
      mocks.pairing.current = lite(3);
    });

    it('shows the ring in order with written colour names and marks segment 1', () => {
      open({ pairingId: 'p1' });
      const items = Array.from(document.querySelectorAll('[data-cy="attractap-pairing-pattern"] li')).map((li) =>
        li.textContent?.trim(),
      );
      expect(items).toHaveLength(8);
      expect(items[0]).toContain('1 (start)');
      expect(items.map((text) => text?.replace(/^.*?(Red|Green|Blue|Yellow|White|Magenta)$/, '$1'))).toEqual([
        'Red',
        'Green',
        'Blue',
        'Yellow',
        'White',
        'Magenta',
        'Red',
        'Blue',
      ]);
      expect(document.querySelector('[data-cy="attractap-pairing-code-input"]')).toBeNull();
    });

    it('updates live when the pattern rotates', () => {
      const { rerender } = render(<PairingDialog isOpen pairingId="p1" onClose={vi.fn()} />);
      mocks.pairing.current = lite(4, ['white', 'white', 'white', 'white', 'white', 'white', 'white', 'white']);
      rerender(<PairingDialog isOpen pairingId="p1" onClose={vi.fn()} />);
      expect(screen.getAllByText('White')).toHaveLength(8);
    });

    it('approves with the round it just re-read', async () => {
      open({ pairingId: 'p1' });
      await userEvent.click(approveButton());
      expect(mocks.refetch).toHaveBeenCalled();
      expect(mocks.approve).toHaveBeenCalledWith({ pairingId: 'p1', requestBody: { mode: 'new', round: 3 } });
    });

    it('does not approve a pattern that rotated after the admin looked at it', async () => {
      open({ pairingId: 'p1' });
      mocks.refetchResult.current = lite(4);
      await userEvent.click(approveButton());
      expect(mocks.approve).not.toHaveBeenCalled();
      expect(screen.getByText(/colours changed while you were checking/)).toBeInTheDocument();
    });

    it('sends only one request on a double click', async () => {
      open({ pairingId: 'p1' });
      const button = approveButton();
      await act(async () => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      expect(mocks.approve).toHaveBeenCalledTimes(1);
    });

    it('shows the reason and re-reads when the server calls the round stale', async () => {
      open({ pairingId: 'p1' });
      await userEvent.click(approveButton());
      mocks.refetch.mockClear();
      await act(async () => mocks.approveOptions.current?.onError?.(apiError(409, { message: 'PairingRoundStale' })));
      expect(screen.getByText(/The colours changed/)).toBeInTheDocument();
      expect(mocks.refetch).toHaveBeenCalled();
      // The next approval is possible again after a stale answer.
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledTimes(2);
    });

    it('lists waiting Lite readers when a record is taken over and no code is known', async () => {
      mocks.pairing.current = undefined;
      mocks.pairings.current = [lite(1)];
      open({ presetTargetReaderId: 7 });
      expect(document.querySelector('[data-cy="attractap-pairing-lite-list"]')).not.toBeNull();
      // Each waiting Lite reader is told apart by when it started waiting.
      expect(
        screen.getByRole('button', { name: 'Lite reader waiting since at 2026-10-30T07:00:00.000Z' }),
      ).toBeInTheDocument();
      mocks.pairing.current = lite(1);
      await userEvent.click(document.querySelector('[data-cy="attractap-pairing-pick-p1"]') as HTMLElement);
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'takeover', targetReaderId: 7, round: 1 },
      });
    });
  });

  describe('Lite list', () => {
    it('mentions Lite readers only when some are listed', () => {
      mocks.pairing.current = undefined;
      open({ presetTargetReaderId: 7 });
      expect(screen.getByText('Enter the code shown on the reader.')).toBeInTheDocument();
      expect(screen.queryByText(/For a Lite reader/)).toBeNull();
    });

    it('goes back to the list after a Lite reader was picked', async () => {
      mocks.pairing.current = undefined;
      mocks.pairings.current = [lite(1), { ...lite(1), id: 'p2', createdAt: '2026-10-30T07:05:00.000Z' }];
      open({ presetTargetReaderId: 7 });
      mocks.pairing.current = lite(1);
      await userEvent.click(document.querySelector('[data-cy="attractap-pairing-pick-p1"]') as HTMLElement);
      expect(document.querySelector('[data-cy="attractap-pairing-lite-list"]')).toBeNull();
      mocks.pairing.current = undefined;
      await userEvent.click(screen.getByRole('button', { name: 'Choose another reader' }));
      expect(document.querySelector('[data-cy="attractap-pairing-lite-list"]')).not.toBeNull();
      expect(document.querySelector('[data-cy="attractap-pairing-pick-p2"]')).not.toBeNull();
    });
  });

  describe('entry points', () => {
    it('looks up the reader of a ?enroll code right away', () => {
      mocks.pairing.current = undefined;
      open({ presetCode: 'k7p3xq' });
      expect(mocks.resolve).toHaveBeenCalledTimes(1);
      expect(mocks.resolve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } });
    });

    it('marks an approval from the web flasher', async () => {
      mocks.pairing.current = undefined;
      open({ presetCode: 'K7P-3XQ', via: 'flasher' });
      mocks.pairing.current = waiting();
      act(() => mocks.resolveOptions.current?.onSuccess?.(waiting()));
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'new', code: 'K7P3XQ', via: 'flasher' },
      });
    });

    describe('waiting for a token reader', () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it('says the reader did not respond after 30 seconds', async () => {
        mocks.pairing.current = undefined;
        open({ waitForReaderId: 4 });
        expect(screen.getByText('Waiting for the reader…')).toBeInTheDocument();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(screen.getByText(/did not respond/)).toBeInTheDocument();
      });

      it('lets the admin approve a reader that arrives after 30 seconds', async () => {
        mocks.pairing.current = undefined;
        const props = { isOpen: true, waitForReaderId: 4, onClose: vi.fn() };
        const { rerender } = render(<PairingDialog {...props} />);
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(screen.getByText(/did not respond/)).toBeInTheDocument();
        mocks.pairing.current = waiting({ boundReaderId: 4 });
        mocks.pairings.current = [waiting({ boundReaderId: 4 })];
        rerender(<PairingDialog {...props} />);
        expect(screen.queryByText(/did not respond/)).toBeNull();
        type('K7P3XQ');
        expect(approveButton()).toBeEnabled();
      });

      it('keeps showing the request after it ended, with the reason', () => {
        mocks.pairing.current = waiting({ boundReaderId: 4 });
        mocks.pairings.current = [waiting({ boundReaderId: 4 })];
        const props = { isOpen: true, waitForReaderId: 4, onClose: vi.fn() };
        const { rerender } = render(<PairingDialog {...props} />);
        // The list holds running requests only; the detail of the ended one is still there.
        mocks.pairings.current = [];
        mocks.pairing.current = waiting({ boundReaderId: 4, state: 'expired', failureReason: 'expired' });
        rerender(<PairingDialog {...props} />);
        expect(screen.queryByText('Waiting for the reader…')).toBeNull();
        expect(screen.getByText('The reader was not approved within 10 minutes.')).toBeInTheDocument();
      });

      it('continues with the request the reader sends', () => {
        mocks.pairing.current = waiting({ boundReaderId: 4 });
        mocks.pairings.current = [waiting({ boundReaderId: 4 })];
        open({ waitForReaderId: 4 });
        expect(screen.queryByText('Waiting for the reader…')).toBeNull();
        expect(approveButton()).toBeDisabled();
      });
    });
  });
  describe('server answers', () => {
    const cases: Array<[number, string, RegExp]> = [
      [409, 'PairingFailed', /because of an error on the server/],
      [409, 'PairingReaderGone', /disconnected before pairing finished. It will show a new code/],
      [409, 'PairingKeyInUse', /already paired with another record/],
      [409, 'PairingNotWaiting', /no longer waiting/],
      [404, 'Reader not found', /to take over no longer exists/],
      [400, 'This reader is bound to a different record', /cannot be paired this way/],
      [400, 'targetReaderId is required', /Choose which reader this one takes over/],
    ];
    it.each(cases)('explains %i %s in its own words', (status, message, text) => {
      open({ pairingId: 'p1' });
      act(() => mocks.approveOptions.current?.onError?.(apiError(status, { message })));
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.queryByText(/could not be paired:/)).toBeNull();
    });

    it('keeps the server message for anything it does not know', () => {
      open({ pairingId: 'p1' });
      act(() => mocks.approveOptions.current?.onError?.(apiError(400, { message: 'name too long' })));
      expect(screen.getByText('The reader could not be paired: name too long')).toBeInTheDocument();
    });

    it('re-reads an ended request and lets the result explain it instead of the error', async () => {
      const { rerender } = render(<PairingDialog isOpen pairingId="p1" onClose={vi.fn()} />);
      mocks.refetch.mockClear();
      await act(async () => mocks.approveOptions.current?.onError?.(apiError(409, { message: 'PairingReaderGone' })));
      expect(mocks.refetch).toHaveBeenCalled();
      mocks.pairing.current = waiting({ state: 'failed', failureReason: 'reader-disconnected' });
      rerender(<PairingDialog isOpen pairingId="p1" onClose={vi.fn()} />);
      expect(screen.getByText('Pairing failed. The reader starts over with a new code by itself.')).toBeInTheDocument();
      expect(screen.getByText('The reader disconnected before pairing finished.')).toBeInTheDocument();
      expect(document.querySelector('[data-cy="attractap-pairing-error"]')).toBeNull();
    });
  });

  describe('waiting after too many attempts', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('counts down, keeps the wait while typing, and blocks approving until it is over', async () => {
      open({ pairingId: 'p1' });
      type('K7P3XQ');
      act(() =>
        mocks.approveOptions.current?.onError?.(
          apiError(429, { message: 'EnrollmentRateLimited', retryAfterSeconds: 3 }),
        ),
      );
      expect(screen.getByText('Too many attempts. Try again in 3 seconds.')).toBeInTheDocument();
      expect(approveButton()).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByText('Too many attempts. Try again in 2 seconds.')).toBeInTheDocument();
      type('K7P3XR');
      expect(screen.getByText('Too many attempts. Try again in 2 seconds.')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.queryByText(/Too many attempts/)).toBeNull();
      expect(approveButton()).toBeEnabled();
    });

    it('also blocks looking a code up', async () => {
      mocks.pairing.current = undefined;
      open({});
      type('K7P3XQ');
      act(() =>
        mocks.resolveOptions.current?.onError?.(
          apiError(429, { message: 'EnrollmentRateLimited', retryAfterSeconds: 5 }),
        ),
      );
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
  });

  describe('a code that went stale', () => {
    it('asks for the current code again after a found code was rejected', async () => {
      open({ presetCode: 'K7P-3XQ' });
      act(() => mocks.resolveOptions.current?.onSuccess?.(waiting()));
      expect(document.querySelector('[data-cy="attractap-pairing-code-input"]')).toBeNull();
      await userEvent.click(approveButton());
      act(() => mocks.approveOptions.current?.onError?.(apiError(404, { message: 'PairingCodeNotFound' })));

      expect(screen.getByText(/does not match the reader/)).toBeInTheDocument();
      expect(document.querySelector('[data-cy="attractap-pairing-code-input"]')).toHaveValue('');
      expect(approveButton()).toBeDisabled();
      type('MNP-4RS');
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenLastCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'new', code: 'MNP4RS' },
      });
    });

    it('follows the code the web flasher reads while the admin has not typed one', async () => {
      const props = { isOpen: true, presetCode: 'K7P-3XQ', via: 'flasher' as const, onClose: vi.fn() };
      const { rerender } = render(<PairingDialog {...props} />);
      act(() => mocks.resolveOptions.current?.onSuccess?.(waiting()));
      rerender(<PairingDialog {...props} presetCode="MNP-4RS" />);
      expect(screen.getByText(/Reader found for code MNP-4RS/)).toBeInTheDocument();
      await userEvent.click(approveButton());
      expect(mocks.approve).toHaveBeenLastCalledWith({
        pairingId: 'p1',
        requestBody: { mode: 'new', code: 'MNP4RS', via: 'flasher' },
      });
      expect(mocks.resolve).toHaveBeenCalledTimes(1);
    });

    it('fills in the newer flasher code after a rejection, but never overwrites a typed code', () => {
      const props = { isOpen: true, presetCode: 'K7P-3XQ', via: 'flasher' as const, onClose: vi.fn() };
      const { rerender } = render(<PairingDialog {...props} />);
      act(() => mocks.resolveOptions.current?.onSuccess?.(waiting()));
      act(() => mocks.approveOptions.current?.onError?.(apiError(404, { message: 'PairingCodeNotFound' })));
      rerender(<PairingDialog {...props} presetCode="MNP-4RS" />);
      const input = () => document.querySelector('[data-cy="attractap-pairing-code-input"]');
      expect(input()).toHaveValue('MNP-4RS');
      type('ABC-DEF');
      rerender(<PairingDialog {...props} presetCode="XYZ-234" />);
      expect(input()).toHaveValue('ABC-DEF');
    });
  });

  describe('Enter key', () => {
    it('looks the reader up when its code is needed, once even when pressed twice', async () => {
      mocks.pairing.current = undefined;
      open({});
      const input = screen.getByRole('textbox', { name: /code on the reader/i });
      await userEvent.type(input, 'k7p3xq{enter}{enter}');
      expect(mocks.resolve).toHaveBeenCalledTimes(1);
      expect(mocks.resolve).toHaveBeenCalledWith({ requestBody: { code: 'K7P3XQ' } });
    });

    it('approves when the reader is known', async () => {
      open({ pairingId: 'p1' });
      await userEvent.type(screen.getByRole('textbox', { name: /code on the reader/i }), 'K7P3XQ{enter}');
      expect(mocks.approve).toHaveBeenCalledWith({ pairingId: 'p1', requestBody: { mode: 'new', code: 'K7P3XQ' } });
    });

    it('does nothing without a valid code', async () => {
      open({ pairingId: 'p1' });
      await userEvent.type(screen.getByRole('textbox', { name: /code on the reader/i }), 'K7P{enter}');
      expect(mocks.approve).not.toHaveBeenCalled();
    });
  });

  describe('takeover picker', () => {
    it('offers every reader, also a token reader that was never paired', () => {
      open({ pairingId: 'p1' });
      act(() => mocks.selects[0]?.onChange?.('takeover'));
      const picker = mocks.selects.at(-1);
      expect(picker?.items.map((item) => item.label)).toEqual(['Door', 'Old token reader']);
    });
  });
});
