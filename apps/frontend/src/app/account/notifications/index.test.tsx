import { ApiError } from '@attraccess/react-query-client';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationPreferencesForm } from './index';
import { registerRendersNotificationCategoriesWithEmailPushAndToastColumns } from './index.test-cases';
import { registerRendersNotificationChannelLabelsAboveEachGroupedCategoryList } from './index.test-cases';
import { registerGroupsNotificationCategoriesByRelevantAudienceWithoutHidingThem } from './index.test-cases';
import { registerRendersTheGermanRfidCardLabelAndDescription } from './index.test-cases';
import { registerUpdatesASingleChannelForTheSelectedCategory } from './index.test-cases';
import { registerEnablesAPushPreferenceWithoutSubscribingThisDevice } from './index.test-cases';
import { registerKeepsSwitchesEnabledWhileAPreferenceUpdateIsPending } from './index.test-cases';
import { registerShowsEnabledPushPreferencesEvenWhenThisBrowserIsNotSubscribed } from './index.test-cases';
import { registerRequiresAnExplicitActionToEnableThisDeviceAfterDeferringThePrompt } from './index.test-cases';
import { registerExplainsABlockedBrowserPermissionWithoutRequestingItAgain } from './index.test-cases';
import { registerShowsActionableFeedbackIfExplicitSubscriptionFails } from './index.test-cases';
import { registerCanRegisterAnExistingBrowserSubscriptionForThisAccountAndRetryAFailedRegistration } from './index.test-cases';

const hoisted = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutationOptions: {} as { onError: (error: unknown) => void },
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
    publicKey: 'AQID',
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
  useNotificationsServiceNotificationsUpdatePreferences: (options: typeof hoisted.mutationOptions) => {
    hoisted.mutationOptions = options;
    return { mutate: hoisted.mutate, isPending: hoisted.isPending };
  },
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
  defineNotificationPreferencesFormTests();
});

it('shows single-category validation errors with a fallback for unusable server messages', () => {
  renderForm();
  const failure = (message: unknown) =>
    Object.assign(
      new ApiError(
        { method: 'PATCH', url: '/preferences' },
        { url: '/preferences', ok: false, status: 400, statusText: 'Bad Request', body: undefined },
        'Rejected',
      ),
      { body: { message } },
    );
  for (const [error, title] of [
    [failure(['Denied', 'Other']), 'Denied'],
    [failure('Not permitted'), 'Not permitted'],
    [failure('  '), 'Could not update notification preferences'],
    [{}, 'Could not update notification preferences'],
  ] as const) {
    act(() => hoisted.mutationOptions.onError(error));
    expect(hoisted.errorToast).toHaveBeenLastCalledWith({ title });
  }
});

export function defineNotificationPreferencesFormTests() {
  const scope = {
    renderForm,
    get hoisted() {
      return hoisted;
    },
  };
  registerRendersNotificationCategoriesWithEmailPushAndToastColumns(scope);

  registerRendersNotificationChannelLabelsAboveEachGroupedCategoryList(scope);

  registerGroupsNotificationCategoriesByRelevantAudienceWithoutHidingThem(scope);

  registerRendersTheGermanRfidCardLabelAndDescription(scope);

  registerUpdatesASingleChannelForTheSelectedCategory(scope);

  registerEnablesAPushPreferenceWithoutSubscribingThisDevice(scope);

  registerKeepsSwitchesEnabledWhileAPreferenceUpdateIsPending(scope);

  registerShowsEnabledPushPreferencesEvenWhenThisBrowserIsNotSubscribed(scope);
  registerRequiresAnExplicitActionToEnableThisDeviceAfterDeferringThePrompt(scope);

  registerExplainsABlockedBrowserPermissionWithoutRequestingItAgain(scope);

  registerShowsActionableFeedbackIfExplicitSubscriptionFails(scope);
  registerCanRegisterAnExistingBrowserSubscriptionForThisAccountAndRetryAFailedRegistration(scope);

  return scope;
}

export type NotificationPreferencesFormTestScope = ReturnType<typeof defineNotificationPreferencesFormTests>;
