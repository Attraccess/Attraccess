import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalPushNotifications } from './GlobalPushNotifications';
import { TestWrapper } from '../../test-utils/wrappers';

const hoisted = vi.hoisted(() => ({
  subscribe: vi.fn(),
  pushState: {
    isSupported: true,
    isLoadingKey: false,
    publicKey: 'AQID',
    permission: 'default' as NotificationPermission,
    isSubscribed: false,
    isBusy: false,
  },
}));

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    ...hoisted.pushState,
    subscribe: hoisted.subscribe,
  }),
}));

describe('GlobalPushNotifications', () => {
  beforeEach(() => {
    hoisted.subscribe.mockReset().mockResolvedValue(true);
    hoisted.pushState.isSupported = true;
    hoisted.pushState.isLoadingKey = false;
    hoisted.pushState.publicKey = 'AQID';
    hoisted.pushState.permission = 'default';
    hoisted.pushState.isSubscribed = false;
    hoisted.pushState.isBusy = false;
    sessionStorage.removeItem('push-permission-dismissed');

    // Stub Notification API (not available in happy-dom)
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
      configurable: true,
      writable: true,
    });
  });

  it('shows a permission modal when push is supported and not yet subscribed', async () => {
    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });

    await waitFor(() => expect(screen.getByText('Enable push notifications')).toBeInTheDocument());
    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes when the user clicks Allow in the modal', async () => {
    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });

    await waitFor(() => expect(screen.getByText('Allow')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Allow'));

    await waitFor(() => expect(hoisted.subscribe).toHaveBeenCalledTimes(1));
  });

  it('does not show the modal when browser push is unsupported', () => {
    hoisted.pushState.isSupported = false;

    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });

  it('does not show the modal when already subscribed', () => {
    hoisted.pushState.isSubscribed = true;

    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
  });

  it('does not show the modal when permission is already granted', () => {
    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted', requestPermission: vi.fn() },
      configurable: true,
      writable: true,
    });

    render(<GlobalPushNotifications enabled />, { wrapper: TestWrapper });

    expect(screen.queryByText('Enable push notifications')).not.toBeInTheDocument();
  });
});
