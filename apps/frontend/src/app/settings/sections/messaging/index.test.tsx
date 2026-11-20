import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  usePushGetVapidConfig,
  usePushReplaceVapidKeys,
  useGetMessagingRateLimitSettings,
  useUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { MessagingSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useGetMessagingRateLimitSettings: vi.fn(),
  UseGetMessagingRateLimitSettingsKeyFn: () => ['messaging-limits'],
  useUpdateMessagingRateLimitSettings: vi.fn(),
  usePushGetVapidConfig: vi.fn(),
  UsePushGetVapidConfigKeyFn: () => ['vapid'],
  usePushReplaceVapidKeys: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key }),
  }))()),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const LIMITS = {
  sendMaxPerWindow: 30,
  sendWindowSeconds: 60,
  contactMaxPerWindow: 5,
  contactWindowSeconds: 3600,
};

const saveLimits = vi.fn();

const mockLimitsQuery = (data: unknown, isLoading = false) =>
  vi
    .mocked(useGetMessagingRateLimitSettings)
    .mockReturnValue({ data, isLoading } as ReturnType<typeof useGetMessagingRateLimitSettings>);

const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

describe('MessagingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimitsQuery(LIMITS);
    vi.mocked(useUpdateMessagingRateLimitSettings).mockReturnValue({
      mutate: saveLimits,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateMessagingRateLimitSettings>);
    vi.mocked(usePushGetVapidConfig).mockReturnValue({
      data: { publicKey: 'BPublicKey', subscriptionCount: 3 },
    } as ReturnType<typeof usePushGetVapidConfig>);
    vi.mocked(usePushReplaceVapidKeys).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof usePushReplaceVapidKeys>);
  });

  it('shows no save bar until a limit is edited', () => {
    const { container } = render(<MessagingSection />);

    expect(saveBar(container)).toBeNull();
  });

  it('does not strand an undismissable save bar when the limits query fails', async () => {
    // The gate covered isLoading only, so an errored query rendered the section with `limits`
    // undefined. Every field fell back to NaN, `Object.is(NaN, undefined)` is false, and the bar
    // came up on first paint with no edit behind it — Save disabled because NaN is not an integer,
    // Discard powerless because the draft was already empty.
    mockLimitsQuery(undefined);

    const { container } = render(<MessagingSection />);

    expect(saveBar(container)).toBeNull();
    expect(screen.getByTestId('messaging-limits-load-failed')).toHaveTextContent('limits.loadFailed');
    expect(screen.queryByTestId('messaging-limit-row-sendMaxPerWindow')).not.toBeInTheDocument();
  });

  it('keeps the push controls usable when only the limits fail', () => {
    // VAPID is a separate query and unaffected, so the failure replaces the four rows it covers and
    // nothing else — gating the whole section would have taken the push key down with it.
    mockLimitsQuery(undefined);

    render(<MessagingSection />);

    expect(screen.getByDisplayValue('BPublicKey')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerateButton/ })).toBeInTheDocument();
  });

  it('saves an edited limit', async () => {
    const { container } = render(<MessagingSection />);

    const field = screen.getByLabelText('fields.sendMaxPerWindow.label');
    await userEvent.clear(field);
    await userEvent.type(field, '45');
    await userEvent.tab();

    expect(saveBar(container)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveLimits).toHaveBeenCalledWith({ body: { ...LIMITS, sendMaxPerWindow: 45 } });
  });

  it('keeps the bar mounted but blocks Save while a field is cleared', async () => {
    // Discard has to stay reachable, so a cleared field is still dirty — it just cannot be saved.
    const { container } = render(<MessagingSection />);

    await userEvent.clear(screen.getByLabelText('fields.sendMaxPerWindow.label'));
    await userEvent.tab();

    expect(saveBar(container)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'saveBar.save' })).toBeDisabled();
    expect(saveLimits).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));
    expect(saveBar(container)).toBeNull();
  });

  it('requests the VAPID config in parallel with the limits, once each', () => {
    // Subscribing in the rows delayed VAPID until the limits had arrived, and the rows refetched
    // the limits on mount (the shared client has no `staleTime`).
    mockLimitsQuery(undefined, true);
    const { rerender } = render(<MessagingSection />);

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(usePushGetVapidConfig).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockLimitsQuery(LIMITS);
    rerender(<MessagingSection />);

    expect(useGetMessagingRateLimitSettings).toHaveBeenCalledTimes(1);
    expect(usePushGetVapidConfig).toHaveBeenCalledTimes(1);
  });

  it('keeps typed custom keys and an open confirmation through a limits refetch after an error', async () => {
    // A refetch of a query without data goes back to loading, which shows the spinner and unmounts
    // the rows. The keys and the confirmation step must still be there when the rows come back.
    mockLimitsQuery(undefined);
    const { rerender } = render(<MessagingSection />);

    await userEvent.type(screen.getByLabelText('publicKeyInputLabel'), 'BCustomPublic');
    await userEvent.type(screen.getByLabelText('privateKeyInputLabel'), 'custom-private');
    await userEvent.click(screen.getByRole('button', { name: 'applyCustomButton' }));
    expect(await screen.findByRole('alertdialog', { name: 'confirmWarning.title' })).toBeInTheDocument();

    mockLimitsQuery(undefined, true);
    rerender(<MessagingSection />);
    expect(screen.getByText('loading')).toBeInTheDocument();

    mockLimitsQuery(undefined);
    rerender(<MessagingSection />);

    expect(screen.getByLabelText('publicKeyInputLabel')).toHaveValue('BCustomPublic');
    expect(screen.getByLabelText('privateKeyInputLabel')).toHaveValue('custom-private');
    expect(await screen.findByRole('alertdialog', { name: 'confirmWarning.title' })).toBeInTheDocument();
  });

  it('walks the two-step key replacement and goes back to step one on Escape', async () => {
    const replace = vi.fn();
    vi.mocked(usePushReplaceVapidKeys).mockReturnValue({
      mutate: replace,
      isPending: false,
    } as unknown as ReturnType<typeof usePushReplaceVapidKeys>);
    render(<MessagingSection />);

    await userEvent.click(screen.getByRole('button', { name: /regenerateButton/ }));
    expect(await screen.findByRole('alertdialog', { name: 'confirmWarning.title' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'confirmWarning.continue' }));
    expect(await screen.findByRole('alertdialog', { name: 'confirmFinal.title' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'confirmWarning.title' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'confirmWarning.continue' }));
    await userEvent.click(await screen.findByRole('button', { name: 'confirmFinal.confirm' }));
    expect(replace).toHaveBeenCalledWith({ body: {} });
  });
});
