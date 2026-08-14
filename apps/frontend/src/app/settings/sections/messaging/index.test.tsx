import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  usePushServicePushGetVapidConfig,
  usePushServicePushReplaceVapidKeys,
  useSettingsServiceGetMessagingRateLimitSettings,
  useSettingsServiceUpdateMessagingRateLimitSettings,
} from '@attraccess/react-query-client';
import { MessagingSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useSettingsServiceGetMessagingRateLimitSettings: vi.fn(),
  UseSettingsServiceGetMessagingRateLimitSettingsKeyFn: () => ['messaging-limits'],
  useSettingsServiceUpdateMessagingRateLimitSettings: vi.fn(),
  usePushServicePushGetVapidConfig: vi.fn(),
  UsePushServicePushGetVapidConfigKeyFn: () => ['vapid'],
  usePushServicePushReplaceVapidKeys: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
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
  vi.mocked(useSettingsServiceGetMessagingRateLimitSettings).mockReturnValue({ data, isLoading } as ReturnType<
    typeof useSettingsServiceGetMessagingRateLimitSettings
  >);

const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

describe('MessagingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLimitsQuery(LIMITS);
    vi.mocked(useSettingsServiceUpdateMessagingRateLimitSettings).mockReturnValue({
      mutate: saveLimits,
      isPending: false,
    } as unknown as ReturnType<typeof useSettingsServiceUpdateMessagingRateLimitSettings>);
    vi.mocked(usePushServicePushGetVapidConfig).mockReturnValue({
      data: { publicKey: 'BPublicKey', subscriptionCount: 3 },
    } as ReturnType<typeof usePushServicePushGetVapidConfig>);
    vi.mocked(usePushServicePushReplaceVapidKeys).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof usePushServicePushReplaceVapidKeys>);
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

    expect(saveLimits).toHaveBeenCalledWith({ requestBody: { ...LIMITS, sendMaxPerWindow: 45 } });
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
});
