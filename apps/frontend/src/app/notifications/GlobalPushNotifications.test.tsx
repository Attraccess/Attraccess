import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranslationState } from '@attraccess/plugins-frontend-ui';
import { GlobalPushNotifications } from './GlobalPushNotifications';
import { TestWrapper } from '../../test-utils/wrappers';

const hoisted = vi.hoisted(() => ({
  subscribe: vi.fn(),
  errorToast: vi.fn(),
  pushState: {
    isSupported: true,
    isLoadingKey: false,
    publicKey: 'AQID',
    permission: 'default' as NotificationPermission,
    isSubscribed: false,
    isBusy: false,
  },
}));

vi.mock('../../components/toastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/toastProvider')>();
  return { ...actual, useToastMessage: () => ({ error: hoisted.errorToast }) };
});

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    ...hoisted.pushState,
    subscribe: hoisted.subscribe,
  }),
}));

describe('GlobalPushNotifications', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    hoisted.subscribe.mockReset().mockResolvedValue(true);
    hoisted.errorToast.mockReset();
    hoisted.pushState.isSupported = true;
    hoisted.pushState.isLoadingKey = false;
    hoisted.pushState.publicKey = 'AQID';
    hoisted.pushState.permission = 'default';
    hoisted.pushState.isSubscribed = false;
    hoisted.pushState.isBusy = false;
    sessionStorage.clear();
    localStorage.clear();
    useTranslationState.getState().setLanguage('en');

    // Stub Notification API (not available in happy-dom)
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
      configurable: true,
      writable: true,
    });
  });

  it('shows a permission modal when push is supported and not yet subscribed', async () => {
    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });

    await waitFor(() => expect(screen.getByText('Enable push notifications')).toBeInTheDocument());
    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes when the user clicks Allow in the modal', async () => {
    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });

    await waitFor(() => expect(screen.getByText('Allow')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Allow'));

    await waitFor(() => expect(hoisted.subscribe).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('push-permission-dismissed:anonymous')).toBe('true');
  });

  it('does not show the modal when browser push is unsupported', () => {
    hoisted.pushState.isSupported = false;

    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });

  it('does not show the modal when already subscribed', () => {
    hoisted.pushState.isSubscribed = true;

    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
  });

  it('does not show the modal when permission is already granted', () => {
    hoisted.pushState.permission = 'granted';
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted', requestPermission: vi.fn() },
      configurable: true,
      writable: true,
    });

    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
  });
  it('does not interrupt the first resource page', () => {
    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });

  it('localizes all application-owned prompt copy in German', async () => {
    useTranslationState.getState().setLanguage('de');
    render(<GlobalPushNotifications enabled />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });
    expect(await screen.findByText('Push-Benachrichtigungen aktivieren')).toBeInTheDocument();
    expect(screen.getByText(/Erhalte Benachrichtigungen über neue Nachrichten/)).toBeInTheDocument();
    expect(screen.getByText(/Möchtest du Push-Benachrichtigungen aktivieren/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jetzt nicht' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erlauben' })).toBeInTheDocument();
  });

  it('keeps dismissal across sessions for the same user without dismissing another user', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TestWrapper initialRoute="/messages">{children}</TestWrapper>
    );
    const first = render(<GlobalPushNotifications enabled userId={1} />, { wrapper });
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    first.unmount();
    sessionStorage.clear();
    const next = render(<GlobalPushNotifications enabled userId={1} />, { wrapper });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    next.unmount();
    render(<GlobalPushNotifications enabled userId={2} />, { wrapper });
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeInTheDocument();
  });

  it('honors a dismissal made before persistent preferences were introduced', () => {
    sessionStorage.setItem('push-permission-dismissed', 'true');
    render(<GlobalPushNotifications enabled userId={1} />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it.each(['native-dismissal', 'subscription-error', 'granted-registration-error'])(
    'keeps retry available after %s without recording dismissal',
    async (failure) => {
      if (failure === 'native-dismissal') hoisted.subscribe.mockResolvedValueOnce(false);
      else
        hoisted.subscribe.mockImplementationOnce(async () => {
          if (failure === 'granted-registration-error') hoisted.pushState.permission = 'granted';
          throw new Error('Push registration failed');
        });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TestWrapper initialRoute="/messages">{children}</TestWrapper>
      );
      const first = render(<GlobalPushNotifications enabled userId={1} />, { wrapper });
      await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));
      await waitFor(() =>
        expect(hoisted.errorToast).toHaveBeenCalledWith({
          title:
            'Could not enable push notifications. Try again, or check your browser notification settings and enable this device in your account.',
        }),
      );
      expect(localStorage.getItem('push-permission-dismissed:1')).toBeNull();
      expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument();
      if (failure !== 'granted-registration-error') {
        first.unmount();
        render(<GlobalPushNotifications enabled userId={1} />, { wrapper });
      }
      await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));
      expect(hoisted.subscribe).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem('push-permission-dismissed:1')).toBe('true');
    },
  );
  it.each(['Allow', 'Not now'])('still handles %s when browser storage is blocked', async (action) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key.startsWith('push-permission-dismissed')) throw new Error('Storage blocked');
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key.startsWith('push-permission-dismissed')) throw new Error('Storage blocked');
      return setItem.call(this, key, value);
    });
    const view = render(<GlobalPushNotifications enabled userId={1} />, {
      wrapper: ({ children }) => <TestWrapper initialRoute="/messages">{children}</TestWrapper>,
    });
    await userEvent.click(await screen.findByRole('button', { name: action }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerender(<GlobalPushNotifications enabled={false} userId={1} />);
    view.rerender(<GlobalPushNotifications enabled userId={1} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hoisted.subscribe).toHaveBeenCalledTimes(action === 'Allow' ? 1 : 0);
    expect(hoisted.errorToast).not.toHaveBeenCalled();
  });
});
