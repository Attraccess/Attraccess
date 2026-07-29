import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  isPending: false,
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
  locale: 'en',
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: hoisted.invalidateQueries }),
  };
});

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: ({ en, de }: { en: Record<string, unknown>; de: Record<string, unknown> }) => ({
    t: (key: string) => {
      const translations = hoisted.locale === 'de' ? de : en;
      const value = key.split('.').reduce<unknown>((current, part) => {
        if (current && typeof current === 'object' && part in current) {
          return (current as Record<string, unknown>)[part];
        }
        return undefined;
      }, translations);
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
    NFC_CARDS: 'nfc_cards',
    PROJECT_INVITATIONS: 'project_invitations',
    ACCESS_CHANGES: 'access_changes',
  },
  UseNotificationsServiceNotificationsGetPreferencesKeyFn: () => ['NotificationsServiceNotificationsGetPreferences'],
  useNotificationsServiceNotificationsGetPreferences: () => ({ data: hoisted.preferences, isLoading: false }),
  useNotificationsServiceNotificationsUpdatePreferences: () => ({ mutate: hoisted.mutate, isPending: hoisted.isPending }),
  useLicenseServiceGetLicenseInformation: () => ({ data: { modules: ['maintenance'] } }),
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
  hoisted.isPending = false;
  hoisted.pushState.isSupported = true;
  hoisted.pushState.permission = 'granted';
  hoisted.pushState.isSubscribed = true;
  hoisted.pushState.isBusy = false;
  hoisted.pushState.isLoadingKey = false;
  hoisted.locale = 'en';
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
    expect(screen.getAllByText('NFC cards').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Access changes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Email').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Push').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In-app').length).toBeGreaterThan(0);
  });

  it('renders notification channel labels above each grouped category list', () => {
    renderForm();

    const generalLabels = screen.getByTestId('notification-channel-labels-general');
    expect(within(generalLabels).queryByText('Notification')).not.toBeInTheDocument();
    expect(within(generalLabels).getByText('Email')).toBeInTheDocument();
    expect(within(generalLabels).getByText('Push')).toBeInTheDocument();
    expect(within(generalLabels).getByText('In-app')).toBeInTheDocument();
    expect(screen.getByTestId('notification-channel-labels-resourceManagers')).toBeInTheDocument();
    expect(screen.getByTestId('notification-channel-labels-admins')).toBeInTheDocument();

    expect(screen.getByTestId('notification-preferences-mobile')).toBeInTheDocument();
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Maintenance requests');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Email');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('Push');
    expect(screen.getByTestId('notification-preferences-mobile')).toHaveTextContent('In-app');
  });

  it('groups notification categories by relevant audience without hiding them', () => {
    renderForm();

    const general = screen.getByTestId('notification-group-general');
    expect(within(general).getByText('All users')).toBeInTheDocument();
    expect(within(general).getByText('Notifications every user may receive.')).toBeInTheDocument();
    expect(within(general).getByText('Messages')).toBeInTheDocument();
    expect(within(general).getByText('NFC cards')).toBeInTheDocument();
    expect(within(general).getByText('Project invitations')).toBeInTheDocument();

    const resourceManagers = screen.getByTestId('notification-group-resourceManagers');
    expect(within(resourceManagers).getByText('Introducers and maintainers')).toBeInTheDocument();
    expect(within(resourceManagers).getByText('Notifications for users who manage or supervise resources.')).toBeInTheDocument();
    expect(within(resourceManagers).getByText('Maintenance requests')).toBeInTheDocument();
    expect(within(resourceManagers).getByText('Resource health')).toBeInTheDocument();

    const admins = screen.getByTestId('notification-group-admins');
    expect(within(admins).getByText('Admins')).toBeInTheDocument();
    expect(within(admins).getByText('Notifications tied to system-level or access-management permissions.')).toBeInTheDocument();
    expect(within(admins).getByText('Access changes')).toBeInTheDocument();
  });

  it('renders the German NFC card label and description', () => {
    hoisted.locale = 'de';

    renderForm();

    const general = screen.getByTestId('notification-group-general');
    expect(within(general).getByText('NFC-Karten')).toBeInTheDocument();
    expect(
      within(general).getByText('Wenn eine deiner NFC-Karten registriert, aktiviert, deaktiviert oder gelöscht wird.'),
    ).toBeInTheDocument();
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

  it('keeps switches enabled while a preference update is pending', () => {
    hoisted.isPending = true;

    renderForm();

    expect(screen.getByTestId('notifications-maintenance_requests-email')).not.toBeDisabled();
    expect(screen.getByTestId('notifications-maintenance_requests-push')).not.toBeDisabled();
    expect(screen.getByTestId('notifications-maintenance_requests-toast')).not.toBeDisabled();
  });

  it('shows enabled push preferences even when this browser is not subscribed', () => {
    hoisted.pushState.permission = 'default';
    hoisted.pushState.isSubscribed = false;

    renderForm();

    expect(screen.getByTestId('notifications-resource_health-push')).toHaveAttribute('aria-pressed', 'true');
  });
});
