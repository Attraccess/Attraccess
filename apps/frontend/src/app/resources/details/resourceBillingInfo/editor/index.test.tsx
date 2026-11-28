import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceBillingInfoEditor } from './index';

const state = vi.hoisted(() => ({
  minorUnit: 2,
  meters: [
    { id: 1, name: 'Largest rate', creditsPerUnit: Number.MAX_SAFE_INTEGER, allocation: 'shared' },
    { id: 2, name: 'Free meter', creditsPerUnit: 0, allocation: 'shared' },
  ],
  setRate: vi.fn().mockResolvedValue(undefined),
  setAllocation: vi.fn().mockResolvedValue(undefined),
  updateConfiguration: vi.fn(),
  billing: {} as Record<number, { data: { currency: string; minorUnit: number } }>,
  resourceConfiguration: {
    data: { configuration: { creditsPerUsage: 0, creditsPerMinute: 0, creditsPerOperatingMinute: 0 } },
  },
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetBillingConfiguration: () => {
    state.billing[state.minorUnit] ??= { data: { currency: 'EUR', minorUnit: state.minorUnit } };
    return state.billing[state.minorUnit];
  },
  useGetResourceBillingConfiguration: () => state.resourceConfiguration,
  useUpdateResourceBillingConfiguration: () => ({ mutate: state.updateConfiguration, isPending: false }),
  useListResourceMeters: () => ({ data: state.meters }),
  useSetResourceMeterRate: () => ({ mutateAsync: state.setRate, isPending: false }),
  ProjectSwitchCharging: {
    CONTINUE: 'continue',
    CONTINUE_PER_PART_ROUNDING: 'continue-per-part-rounding',
    NEW_SESSION: 'new-session',
  },
  useSetResourceMeterAllocation: () => ({
    mutateAsync: state.setAllocation,
    isPending: false,
  }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
  }))()),
}));
vi.mock('../../../../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('../../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('../../meters/MeterNameEditor', () => ({ MeterNameEditor: () => null }));
vi.mock('../metering/MeterNotices', () => ({ MeterSetupNotice: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.minorUnit = 2;
});
afterEach(cleanup);
async function openEditor() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResourceBillingInfoEditor resourceId={1}>
        {(open) => <button onClick={open}>Edit billing</button>}
      </ResourceBillingInfoEditor>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText('Edit billing'));
  return screen.findByRole('textbox', { name: /Largest rate/ });
}
it.each([
  [2, '90071992547409.91'],
  [3, '9007199254740.991'],
  [0, '9007199254740991'],
])('opening and saving an unchanged rate preserves every credit at precision %s', async (minorUnit, expected) => {
  state.minorUnit = minorUnit;
  const input = await openEditor();
  expect(input).toHaveValue(expected);
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() => expect(state.updateConfiguration).toHaveBeenCalledOnce());
  expect(state.setRate).toHaveBeenCalledWith({
    path: { resourceId: 1, meterId: 1 },
    body: { creditsPerUnit: Number.MAX_SAFE_INTEGER },
  });
  expect(state.setRate).toHaveBeenCalledWith({ path: { resourceId: 1, meterId: 2 }, body: { creditsPerUnit: 0 } });
});
it('accepts an exact comma decimal edit without changing another meter rate', async () => {
  await openEditor();
  fireEvent.change(screen.getByRole('textbox', { name: /Free meter/ }), { target: { value: '0,17' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() => expect(state.updateConfiguration).toHaveBeenCalledOnce());
  expect(state.setRate).toHaveBeenCalledWith({ path: { resourceId: 1, meterId: 2 }, body: { creditsPerUnit: 17 } });
  expect(state.setRate).toHaveBeenCalledWith({
    path: { resourceId: 1, meterId: 1 },
    body: { creditsPerUnit: Number.MAX_SAFE_INTEGER },
  });
});
it.each(['0.001', '90071992547409.92', '-1', ''])(
  'rejects an invalid price %j before saving any meter',
  async (value) => {
    await openEditor();
    const input = screen.getByRole('textbox', { name: /Free meter/ });
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(screen.getByText('inputs.meterRate.invalid')).toBeTruthy());
    expect(state.setRate).not.toHaveBeenCalled();
    expect(state.updateConfiguration).not.toHaveBeenCalled();
  },
);
it('saves a changed meter allocation and leaves unchanged ones alone', async () => {
  await openEditor();
  const group = document.querySelector('[data-cy="meter-allocation-2"]') as HTMLElement;
  // Each option explains itself, not only the selected one.
  expect(within(group).getByText('inputs.meterAllocation.description.shared')).toBeTruthy();
  expect(within(group).getByText('inputs.meterAllocation.description.per-session')).toBeTruthy();
  fireEvent.click(within(group).getByRole('radio', { name: 'inputs.meterAllocation.options.per-session' }));
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() => expect(state.updateConfiguration).toHaveBeenCalledOnce());
  expect(state.setAllocation).toHaveBeenCalledTimes(1);
  expect(state.setAllocation).toHaveBeenCalledWith({
    path: { resourceId: 1, meterId: 2 },
    body: { allocation: 'per-session' },
  });
});
it('forgets unsaved choices when the editor is closed and opened again', async () => {
  await openEditor();
  fireEvent.click(screen.getByRole('radio', { name: 'inputs.projectSwitchCharging.options.new-session' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Free meter/ }), { target: { value: '5' } });
  const fee = screen.getByRole('textbox', { name: 'inputs.creditsPerUsage.label' });
  fireEvent.change(fee, { target: { value: '77' } });
  fireEvent.blur(fee);

  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByText('Edit billing'));
  await screen.findByRole('dialog');

  expect(screen.getByRole('radio', { name: 'inputs.projectSwitchCharging.options.continue' })).toBeChecked();
  expect(screen.getByRole('textbox', { name: 'inputs.creditsPerUsage.label' })).toHaveValue('0');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() => expect(state.updateConfiguration).toHaveBeenCalledOnce());
  expect(state.updateConfiguration.mock.calls[0][0].body).toMatchObject({
    creditsPerUsage: 0,
    projectSwitchCharging: 'continue',
  });
});
it('places the project switch charging with the session prices, before the meters', async () => {
  const firstMeter = await openEditor();
  const perMinute = screen.getByRole('textbox', { name: /inputs.creditsPerMinute.label/ });
  const charging = screen.getByRole('radiogroup', { name: /inputs.projectSwitchCharging.label/ });

  expect(perMinute.compareDocumentPosition(charging) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(charging.compareDocumentPosition(firstMeter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
