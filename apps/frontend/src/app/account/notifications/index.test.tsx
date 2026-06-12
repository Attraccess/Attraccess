import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationPreferencesForm } from './index';

const hoisted = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidateQueries: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  successToast: vi.fn(),
  errorToast: vi.fn(),
  preferences: {
    categories: [
      { category: 'messages', channels: { email: true, push: false, toast: true } },
      { category: 'maintenance_requests', channels: { email: true, push: false, toast: true } },
      { category: 'resource_health', channels: { email: true, push: true, toast: false } },
    ],
  },
  pushState: {
    isSupported: true,
    permission: 'granted' as NotificationPermission,
    isSubscribed: true,
    isBusy: false,
    isLoadingKey: false,
  },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: hoisted.invalidateQueries }),
  };
});

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en }: { en: Record<string, unknown> }) => ({
    t: (key: string) => {
      const value = key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
          return (current as Record<string, unknown>)[part];
        }
        return undefined;
      }, en);
      return typeof value === 'string' ? value : key;
    },
  }),
}));

vi.mock('@attraccess/react-query-client', () => ({
  ApiError: class ApiError extends Error {
    body?: unknown;
  },
  NotificationCategory: {
    MESSAGES: 'messages',
    MAINTENANCE_REQUESTS: 'maintenance_requests',
    RESOURCE_USAGE_NOTES: 'resource_usage_notes',
    RESOURCE_HEALTH: 'resource_health',
    RESOURCE_TAKEOVER: 'resource_takeover',
    RESOURCE_SESSION_ENDED: 'resource_session_ended',
    PROJECT_INVITATIONS: 'project_invitations',
    SUPERVISION_REQUESTS: 'supervision_requests',
  },
  UseNotificationsServiceNotificationsGetPreferencesKeyFn: () => ['NotificationsServiceNotificationsGetPreferences'],
  useNotificationsServiceNotificationsGetPreferences: () => ({ data: hoisted.preferences, isLoading: false }),
  useNotificationsServiceNotificationsUpdatePreferences: () => ({ mutate: hoisted.mutate, isPending: false }),
}));

vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: hoisted.successToast, error: hoisted.errorToast }),
}));

vi.mock('../../../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    ...hoisted.pushState,
    subscribe: hoisted.subscribe,
    unsubscribe: hoisted.unsubscribe,
  }),
}));

vi.mock('../../../components/labeledSwitch', () => ({
  LabeledSwitch: ({ children, isSelected, isDisabled, onChange, ...props }: Record<string, unknown>) => (
    <button
      type="button"
      aria-pressed={Boolean(isSelected)}
      disabled={Boolean(isDisabled)}
      onClick={() => (onChange as (value: boolean) => void)?.(!isSelected)}
      {...props}
    >
      {children as React.ReactNode}
    </button>
  ),
}));

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationPreferencesForm />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  hoisted.mutate.mockReset();
  hoisted.invalidateQueries.mockReset();
  hoisted.subscribe.mockReset().mockResolvedValue(true);
  hoisted.unsubscribe.mockReset().mockResolvedValue(true);
  hoisted.successToast.mockReset();
  hoisted.errorToast.mockReset();
  hoisted.pushState.isSupported = true;
  hoisted.pushState.permission = 'granted';
  hoisted.pushState.isSubscribed = true;
  hoisted.pushState.isBusy = false;
  hoisted.pushState.isLoadingKey = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationPreferencesForm', () => {
  it('renders notification categories with email, push, and toast columns', () => {
    renderForm();

    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maintenance requests').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Resource health').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Email').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Push').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In-app').length).toBeGreaterThan(0);
  });

  it('renders a separate mobile list layout for notification channels', () => {
    renderForm();

    expect(screen.getByTestId('notification-preferences-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-mobile')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Maintenance requests');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Email');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Push');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('In-app');
  });

  it('updates a single channel for the selected category', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId('notifications-maintenance_requests-email'));

    expect(hoisted.mutate).toHaveBeenCalledWith({
      requestBody: { category: 'maintenance_requests', channels: { email: false } },
    });
  });

  it('enables a push preference without subscribing this device', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByTestId('notifications-maintenance_requests-push'));

    await waitFor(() => expect(hoisted.mutate).toHaveBeenCalled());
    expect(hoisted.subscribe).not.toHaveBeenCalled();
    expect(hoisted.mutate).toHaveBeenCalledWith({
      requestBody: { category: 'maintenance_requests', channels: { push: true } },
    });
  });

  it('shows enabled push preferences even when this browser is not subscribed', () => {
    hoisted.pushState.permission = 'default';
    hoisted.pushState.isSubscribed = false;

    renderForm();

    expect(screen.getByTestId('notifications-resource_health-push')).toHaveAttribute('aria-pressed', 'true');
  });
});
