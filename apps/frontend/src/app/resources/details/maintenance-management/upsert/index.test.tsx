// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useDateTimePreferences, useTranslationState } from '@attraccess/plugins-frontend-ui';
import { ResourceMaintenanceUpsertModal } from './index';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({
  useResourceMaintenancesServiceCreateMaintenance: () => ({ mutate: create, isPending: false }),
  useResourceMaintenancesServiceFindMaintenancesKey: 'maintenances',
}));
vi.mock('../../../../../hooks/useNow', () => ({ useNow: () => new Date('2026-11-23T16:45:37Z') }));
afterEach(() => {
  cleanup();
  create.mockClear();
  useDateTimePreferences.setState({ dateTimeLocale: null });
});
it('blocks incomplete start and enabled end segments until completed or the end is disabled', async () => {
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' });
  const user = userEvent.setup();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ResourceMaintenanceUpsertModal resourceId={7}>
        {(open) => <button onClick={open}>Schedule</button>}
      </ResourceMaintenanceUpsertModal>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Schedule' }));
  const save = await screen.findByRole('button', { name: 'Save' });
  expect(screen.getByRole('group', { name: 'Start time' })).toBeVisible();
  await user.click(screen.getByRole('spinbutton', { name: /day/i }));
  await user.keyboard('{Backspace}{Backspace}');
  const form = screen.getByRole('group', { name: 'Start time' }).closest('form');
  if (!form) throw new Error('Maintenance fields must be inside the form');
  const submit = new Event('submit', { bubbles: true, cancelable: true });
  fireEvent(form, submit);
  expect(submit.defaultPrevented).toBe(true);
  await user.click(save);
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Complete the date and time.')).toBeVisible();
  await user.click(screen.getByRole('spinbutton', { name: /day/i }));
  await user.keyboard('23');
  await user.click(save);
  expect(create).toHaveBeenCalledTimes(1);
  create.mockClear();
  await user.click(screen.getByRole('switch', { name: 'End time already known?' }));
  expect(screen.getByRole('group', { name: 'End time' })).toBeVisible();
  await user.click(screen.getAllByRole('spinbutton', { name: /day/i })[1]);
  await user.keyboard('{Backspace}{Backspace}');
  await user.click(save);
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByText('Complete the date and time.')).toBeVisible();
  await user.click(screen.getAllByRole('spinbutton', { name: /day/i })[1]);
  await user.keyboard('24');
  await user.click(save);
  expect(create).toHaveBeenCalledTimes(1);
  create.mockClear();
  await user.click(screen.getAllByRole('spinbutton', { name: /day/i })[1]);
  await user.keyboard('{Backspace}{Backspace}');
  await user.click(screen.getByRole('switch', { name: 'End time already known?' }));
  await user.click(save);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ requestBody: expect.objectContaining({ endTime: undefined }) }),
  );
  client.clear();
});
it('edits maintenance time segments and retains the absolute instant across formatting changes', async () => {
  useTranslationState.setState({ language: 'en' });
  useDateTimePreferences.setState({ dateTimeLocale: 'en-GB' });
  const user = userEvent.setup();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ResourceMaintenanceUpsertModal resourceId={7}>
        {(open) => <button onClick={open}>Schedule</button>}
      </ResourceMaintenanceUpsertModal>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Schedule' }));
  await user.click(await screen.findByRole('spinbutton', { name: /minute/i }));
  await user.keyboard('{ArrowUp}');
  act(() => useDateTimePreferences.setState({ dateTimeLocale: 'en-US' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(create).toHaveBeenCalledWith({
    resourceId: 7,
    requestBody: { startTime: '2026-11-23T16:46:37.000Z', endTime: undefined, reason: '' },
  });
  client.clear();
});
