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
    await waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
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

    await user.click(screen.getByRole('button', { name: 'Disable and cancel 4' }));
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
    await user.click(screen.getByRole('button', { name: 'Remove range' }));
    expect(screen.queryByDisplayValue('09:00')).not.toBeInTheDocument();
  });
});
