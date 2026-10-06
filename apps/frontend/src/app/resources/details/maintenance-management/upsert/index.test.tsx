// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
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
  useDateTimePreferences.setState({ dateTimeLocale: null });
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
