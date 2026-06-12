import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalPushNotifications } from './GlobalPushNotifications';

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
  });

  it('automatically subscribes this browser when push is supported on an authenticated page load', async () => {
    render(<GlobalPushNotifications enabled />);

    await waitFor(() => expect(hoisted.subscribe).toHaveBeenCalledTimes(1));
  });

  it('does not subscribe when browser push is unsupported', () => {
    hoisted.pushState.isSupported = false;

    render(<GlobalPushNotifications enabled />);

    expect(hoisted.subscribe).not.toHaveBeenCalled();
  });
});
