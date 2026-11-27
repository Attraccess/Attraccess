import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Registers the shared API mocks before the component's modules load.
import { DEFAULT_UPDATE_POLICY, hoisted, renderWithQuery } from '../index.test.hoisted';
import { AutomaticUpdatesPanel } from './AutomaticUpdatesPanel';

const ENABLED_POLICY = {
  ...DEFAULT_UPDATE_POLICY,
  automaticUpdates: true,
  schedule: { weekdays: [1, 5], startMinute: 150, durationMinutes: 90, timeZone: 'Asia/Tokyo' },
};

const master = () => screen.getByRole('switch', { name: 'Install updates automatically' });
const weekday = (name: string) => screen.getByRole('checkbox', { name });
const nextWindow = () => document.querySelector('[data-cy="plugins-auto-updates-next-window"]');

async function renderPanel() {
  const user = userEvent.setup();
  renderWithQuery(<AutomaticUpdatesPanel />);
  await screen.findByRole('switch', { name: 'Check for plugin updates' });
  return user;
}

describe('AutomaticUpdatesPanel', () => {
  beforeEach(() => {
    // Monday 2026-11-30, 12:00 UTC. Only the date is faked, so the UI's timers keep working.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-30T12:00:00Z') });
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { timeZone: 'Europe/Berlin', locale: 'en-US' } as Intl.ResolvedDateTimeFormatOptions;
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a fresh host with checks on, automatic updates off and nothing to save', async () => {
    await renderPanel();
    expect(screen.getByRole('switch', { name: 'Check for plugin updates' })).toBeChecked();
    expect(master()).not.toBeChecked();
    expect(screen.getByText(/shows available updates but installs nothing/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Monday' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the stored schedule and the next window in its time zone', async () => {
    hoisted.updatePolicy = ENABLED_POLICY;
    await renderPanel();
    expect(master()).toBeChecked();
    expect(weekday('Monday')).toBeChecked();
    expect(weekday('Friday')).toBeChecked();
    expect(weekday('Tuesday')).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: /Time zone/ })).toHaveValue('Asia/Tokyo');
    // 12:00 UTC is Monday 21:00 in Tokyo: that Monday's window is over, Friday 02:30 is next.
    expect(nextWindow()).toHaveTextContent(/Next update window: Fri, Dec 4, 2026.*02:30.*04:00.*\(Asia\/Tokyo\)/);
    expect(nextWindow()).toHaveTextContent('Attraccess restarts during this window if it installed an update.');
  });

  it('needs a weekday, fills in the browser zone and asks before it switches automatic updates on', async () => {
    const user = await renderPanel();
    await user.click(master());

    expect(screen.getByText('Choose at least one weekday.')).toBeInTheDocument();
    const turnOn = screen.getByRole('button', { name: 'Turn on automatic updates' });
    expect(turnOn).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Time zone/ })).toHaveValue('Europe/Berlin');

    await user.click(weekday('Wednesday'));
    await user.click(weekday('Monday'));
    expect(screen.queryByText('Choose at least one weekday.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Turn on automatic updates' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('restart during the scheduled windows');
    expect(hoisted.setUpdatePolicyMock).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Turn on automatic updates' }));
    expect(hoisted.setUpdatePolicyMock).toHaveBeenCalledWith({
      body: {
        checksEnabled: true,
        automaticUpdates: true,
        mode: 'minor',
        prerelease: false,
        schedule: { weekdays: [1, 3], startMinute: 180, durationMinutes: 120, timeZone: 'Europe/Berlin' },
      },
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(hoisted.successToast).toHaveBeenCalledWith({ title: 'Automatic update settings saved' });
    // The saved policy is now the stored one.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves nothing when the confirmation is cancelled', async () => {
    const user = await renderPanel();
    await user.click(master());
    await user.click(weekday('Monday'));
    await user.click(screen.getByRole('button', { name: 'Turn on automatic updates' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    expect(hoisted.setUpdatePolicyMock).not.toHaveBeenCalled();
  });

  it('saves switching off without a confirmation and keeps the schedule', async () => {
    hoisted.updatePolicy = ENABLED_POLICY;
    const user = await renderPanel();
    await user.click(master());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(hoisted.setUpdatePolicyMock).toHaveBeenCalledWith({
      body: expect.objectContaining({ automaticUpdates: false, schedule: ENABLED_POLICY.schedule }),
    });
  });

  it('does not save a schedule without a duration', async () => {
    hoisted.updatePolicy = ENABLED_POLICY;
    const user = await renderPanel();
    const duration = screen.getByRole('textbox', { name: /Duration/ });
    await user.clear(duration);
    fireEvent.blur(duration);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(nextWindow()).toBeNull();
  });

  it('says that nothing is installed while the update check is off', async () => {
    hoisted.updatePolicy = ENABLED_POLICY;
    const user = await renderPanel();
    await user.click(screen.getByRole('switch', { name: 'Check for plugin updates' }));
    expect(screen.getByText('Update checks are off, so nothing will be installed.')).toBeInTheDocument();
    expect(nextWindow()).toBeNull();
  });

  it('keeps the edits and reports an error when saving fails', async () => {
    hoisted.updatePolicy = ENABLED_POLICY;
    hoisted.setUpdatePolicyMock.mockRejectedValue(new Error('refused'));
    const user = await renderPanel();
    await user.click(weekday('Sunday'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(hoisted.errorToast).toHaveBeenCalledWith({ title: 'Could not save the automatic update settings' }),
    );
    expect(weekday('Sunday')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('reports a policy that cannot be loaded', async () => {
    hoisted.updatePolicy = new Error('offline');
    renderWithQuery(<AutomaticUpdatesPanel />);
    expect(await screen.findByText('Could not load the automatic update settings')).toBeInTheDocument();
  });
});
