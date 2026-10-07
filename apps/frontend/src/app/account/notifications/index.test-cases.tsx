import { screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import type { NotificationPreferencesFormTestScope } from './index.test';
import { within } from '@testing-library/react';

export function registerCanRegisterAnExistingBrowserSubscriptionForThisAccountAndRetryAFailedRegistration(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('can register an existing browser subscription for this account and retry a failed registration', async () => {
    // A previous account or failed upsert may leave a browser subscription behind.
    scope.hoisted.pushState.isSubscribed = true;
    scope.hoisted.pushState.permission = 'granted';
    scope.hoisted.subscribe.mockRejectedValueOnce(new Error('Registration failed')).mockResolvedValueOnce(true);
    scope.renderForm();
    expect(scope.hoisted.subscribe).not.toHaveBeenCalled();
    expect(screen.queryByText('Push notifications are enabled on this device.')).not.toBeInTheDocument();
    const enable = screen.getByRole('button', { name: 'Enable on this device' });
    await userEvent.click(enable);
    await waitFor(() => expect(scope.hoisted.errorToast).toHaveBeenCalledTimes(1));
    expect(scope.hoisted.successToast).not.toHaveBeenCalled();
    await userEvent.click(enable);
    await waitFor(() =>
      expect(scope.hoisted.successToast).toHaveBeenCalledWith({
        title: 'Push notifications are enabled on this device.',
      }),
    );
    expect(scope.hoisted.subscribe).toHaveBeenCalledTimes(2);
  });
}

export function registerEnablesAPushPreferenceWithoutSubscribingThisDevice(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('enables a push preference without subscribing this device', async () => {
    const user = userEvent.setup();
    scope.renderForm();

    await user.click(screen.getByTestId('notifications-maintenance_requests-push'));

    await waitFor(() => expect(scope.hoisted.mutate).toHaveBeenCalled());
    expect(scope.hoisted.subscribe).not.toHaveBeenCalled();
    expect(scope.hoisted.mutate).toHaveBeenCalledWith({
      requestBody: { category: 'maintenance_requests', channels: { push: true } },
    });
  });
}

export function registerExplainsABlockedBrowserPermissionWithoutRequestingItAgain(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('explains a blocked browser permission without requesting it again', () => {
    scope.hoisted.pushState.permission = 'denied';
    scope.hoisted.pushState.isSubscribed = false;
    scope.renderForm();
    expect(screen.getByText(/Notifications are blocked for this site/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable on this device' })).not.toBeInTheDocument();
    expect(scope.hoisted.subscribe).not.toHaveBeenCalled();
  });
}

export function registerGroupsNotificationCategoriesByRelevantAudienceWithoutHidingThem(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('groups notification categories by relevant audience without hiding them', () => {
    scope.renderForm();

    const general = screen.getByTestId('notification-group-general');
    expect(within(general).getByText('All users')).toBeInTheDocument();
    expect(within(general).getByText('Notifications every user may receive.')).toBeInTheDocument();
    expect(within(general).getByText('Messages')).toBeInTheDocument();
    expect(within(general).getByText('RFID cards')).toBeInTheDocument();
    expect(within(general).getByText('Project invitations')).toBeInTheDocument();

    const resourceManagers = screen.getByTestId('notification-group-resourceManagers');
    expect(within(resourceManagers).getByText('Introducers and maintainers')).toBeInTheDocument();
    expect(
      within(resourceManagers).getByText('Notifications for users who manage or supervise resources.'),
    ).toBeInTheDocument();
    expect(within(resourceManagers).getByText('Maintenance requests')).toBeInTheDocument();
    expect(within(resourceManagers).getByText('Resource health')).toBeInTheDocument();

    const admins = screen.getByTestId('notification-group-admins');
    expect(within(admins).getByText('Admins')).toBeInTheDocument();
    expect(
      within(admins).getByText('Notifications tied to system-level or access-management permissions.'),
    ).toBeInTheDocument();
    expect(within(admins).getByText('Access changes')).toBeInTheDocument();
  });
}

export function registerKeepsSwitchesEnabledWhileAPreferenceUpdateIsPending(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('keeps switches enabled while a preference update is pending', () => {
    scope.hoisted.isPending = true;

    scope.renderForm();

    expect(screen.getByTestId('notifications-maintenance_requests-email')).not.toBeDisabled();
    expect(screen.getByTestId('notifications-maintenance_requests-push')).not.toBeDisabled();
    expect(screen.getByTestId('notifications-maintenance_requests-toast')).not.toBeDisabled();
  });
}

export function registerRendersNotificationCategoriesWithEmailPushAndToastColumns(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('renders notification categories with email, push, and toast columns', () => {
    scope.renderForm();

    expect(screen.getAllByText('Messages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maintenance requests').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Resource health').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RFID cards').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Access changes').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Email').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Push').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In-app').length).toBeGreaterThan(0);
  });
}

export function registerRendersNotificationChannelLabelsAboveEachGroupedCategoryList(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('renders notification channel labels above each grouped category list', () => {
    scope.renderForm();

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
}

export function registerRendersTheGermanRfidCardLabelAndDescription(scope: NotificationPreferencesFormTestScope): void {
  it('renders the German RFID card label and description', () => {
    scope.hoisted.locale = 'de';

    scope.renderForm();

    const general = screen.getByTestId('notification-group-general');
    expect(within(general).getByText('RFID-Karten')).toBeInTheDocument();
    expect(
      within(general).getByText('Wenn eine deiner RFID-Karten registriert, aktiviert, deaktiviert oder gelöscht wird.'),
    ).toBeInTheDocument();
  });
}

export function registerRequiresAnExplicitActionToEnableThisDeviceAfterDeferringThePrompt(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('requires an explicit action to enable this device after deferring the prompt', async () => {
    scope.hoisted.pushState.isSubscribed = false;
    scope.hoisted.pushState.permission = 'default';
    localStorage.setItem('push-permission-dismissed:1', 'true');
    scope.renderForm();
    expect(scope.hoisted.subscribe).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }));
    expect(scope.hoisted.subscribe).toHaveBeenCalledTimes(1);
  });
}

export function registerShowsActionableFeedbackIfExplicitSubscriptionFails(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('shows actionable feedback if explicit subscription fails', async () => {
    scope.hoisted.pushState.isSubscribed = false;
    scope.hoisted.subscribe.mockResolvedValue(false);
    scope.renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }));
    await waitFor(() =>
      expect(scope.hoisted.errorToast).toHaveBeenCalledWith({
        title: 'Could not enable push notifications. Please check your browser notification permissions.',
      }),
    );
  });
}

export function registerShowsEnabledPushPreferencesEvenWhenThisBrowserIsNotSubscribed(
  scope: NotificationPreferencesFormTestScope,
): void {
  it('shows enabled push preferences even when this browser is not subscribed', () => {
    scope.hoisted.pushState.permission = 'default';
    scope.hoisted.pushState.isSubscribed = false;

    scope.renderForm();

    expect(screen.getByTestId('notifications-resource_health-push')).toHaveAttribute('aria-pressed', 'true');
  });
}

export function registerUpdatesASingleChannelForTheSelectedCategory(scope: NotificationPreferencesFormTestScope): void {
  it('updates a single channel for the selected category', async () => {
    const user = userEvent.setup();
    scope.renderForm();

    await user.click(screen.getByTestId('notifications-maintenance_requests-email'));

    expect(scope.hoisted.mutate).toHaveBeenCalledWith({
      requestBody: { category: 'maintenance_requests', channels: { email: false } },
    });
  });
}
