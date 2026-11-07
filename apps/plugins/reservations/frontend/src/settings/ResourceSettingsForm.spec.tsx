import '@testing-library/jest-dom/vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderWithProviders } from '../test-utils';
import { ResourceSettingsForm } from './ResourceSettingsForm';

const settings = {
  resourceId: 3,
  enabled: true,
  approvalRequired: false,
  timeStepMinutes: 15,
  minDurationMinutes: 15,
  maxDurationMinutes: 240,
  maxAdvanceDays: 30,
  minLeadMinutes: 0,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  maxActiveBookingsPerUser: 3,
  whoCanBook: 'can-start',
  confirmWindowMinutes: 60,
  checkInEnabled: true,
  checkInGraceMinutes: 15,
  earlyCheckInMinutes: 15,
  handoverReminderMinutes: 15,
  showNamesOnReaders: false,
  bookableHours: {},
};

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ResourceSettingsForm', () => {
  it('renders nothing for users who do not manage the resource (403)', async () => {
    const calls = mockFetch({
      'GET /resources/3/settings': () => ({ status: 403, body: { code: 'FORBIDDEN', message: 'no' } }),
    });
    const { container } = renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    // While the request runs a spinner shows; once the 403 has settled nothing is left.
    expect(container.querySelector('[data-cy="reservations-settings-loading"]')).toBeInTheDocument();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(calls).toHaveLength(1);
  });

  it('warns with the booking count before disabling and then saves with cancelFutureBookings', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/settings': settings,
      'GET /resources/3/settings/future-bookings-count': { count: 4 },
      'PUT /resources/3/settings': { settings: { ...settings, enabled: false }, cancelledBookings: 4 },
    });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    await user.click(await screen.findByRole('switch', { name: /Enable reservations/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const warning = await screen.findByRole('alertdialog');
    expect(warning).toHaveTextContent('4 upcoming bookings');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Disable and cancel 4 bookings' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body).toMatchObject({ enabled: false, cancelFutureBookings: true });
  });

  it('saves without a warning when no future bookings exist', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/settings': settings,
      'GET /resources/3/settings/future-bookings-count': { count: 0 },
      'PUT /resources/3/settings': { settings: { ...settings, enabled: false }, cancelledBookings: 0 },
    });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    await user.click(await screen.findByRole('switch', { name: /Enable reservations/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    const put = calls.find((call) => call.method === 'PUT');
    expect((put?.body as Record<string, unknown>).cancelFutureBookings).toBeUndefined();
  });

  it('adds and removes a bookable-hours range for a weekday', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /resources/3/settings': settings });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    const adds = await screen.findAllByRole('button', { name: /Add range/ });
    await user.click(adds[0]);
    expect(screen.getByDisplayValue('09:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('17:00')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'From (Monday, range 1)' })).toHaveValue('09:00');
    expect(screen.getByRole('textbox', { name: 'Until (Monday, range 1)' })).toHaveValue('17:00');
    await user.click(screen.getByRole('button', { name: 'Remove range 1 on Monday' }));
    expect(screen.queryByDisplayValue('09:00')).not.toBeInTheDocument();
  });

  it('keeps Save disabled until something changed', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /resources/3/settings': settings });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: /need approval/ }));
    expect(save).toBeEnabled();
    await user.click(screen.getByRole('switch', { name: /need approval/ }));
    expect(save).toBeDisabled();
  });

  it('shows a visible error message for an invalid number', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /resources/3/settings': settings });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    const input = await screen.findByRole('textbox', { name: /Time step/ });
    await user.clear(input);
    await user.type(input, '7');
    await user.tab();
    const field = document.querySelector('[data-cy="reservations-setting-timeStepMinutes"]');
    // HeroUI hides the description of invalid fields, so the message has to live in the error slot.
    expect(field?.querySelector('[data-slot="field-error"]')).toHaveTextContent('must divide 1440');
  });

  it('switches Enable back on when the disable warning is cancelled', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /resources/3/settings': settings,
      'GET /resources/3/settings/future-bookings-count': { count: 4 },
    });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    const toggle = await screen.findByRole('switch', { name: /Enable reservations/ });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Enable reservations/ })).toBeChecked());
  });

  it('opts in to names on readers with a help text and saves it', async () => {
    const user = userEvent.setup();
    const calls = mockFetch({
      'GET /resources/3/settings': settings,
      'PUT /resources/3/settings': { settings: { ...settings, showNamesOnReaders: true }, cancelledBookings: 0 },
    });
    renderWithProviders(<ResourceSettingsForm resourceId={3} />);
    const toggle = await screen.findByRole('switch', { name: /Show names on readers/ });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Names are shown only after someone taps their card.');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Settings saved');
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({ showNamesOnReaders: true });
  });
});
