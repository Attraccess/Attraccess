import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceBillingInfoEditor } from './index';

const state = vi.hoisted(() => ({
  minorUnit: 2,
  meters: [
    { id: 1, name: 'Largest rate', creditsPerUnit: Number.MAX_SAFE_INTEGER },
    { id: 2, name: 'Free meter', creditsPerUnit: 0 },
  ],
  setRate: vi.fn().mockResolvedValue(undefined),
  updateConfiguration: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBillingServiceGetBillingConfiguration: () => ({ data: { currency: 'EUR', minorUnit: state.minorUnit } }),
  useBillingServiceGetResourceBillingConfiguration: () => ({
    data: { configuration: { creditsPerUsage: 0, creditsPerMinute: 0, creditsPerOperatingMinute: 0 } },
  }),
  useBillingServiceUpdateResourceBillingConfiguration: () => ({ mutate: state.updateConfiguration, isPending: false }),
  useResourceMeteringServiceListResourceMeters: () => ({ data: state.meters }),
  useResourceMeteringServiceSetResourceMeterRate: () => ({ mutateAsync: state.setRate, isPending: false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
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
    resourceId: 1,
    meterId: 1,
    requestBody: { creditsPerUnit: Number.MAX_SAFE_INTEGER },
  });
  expect(state.setRate).toHaveBeenCalledWith({ resourceId: 1, meterId: 2, requestBody: { creditsPerUnit: 0 } });
});
it('accepts an exact comma decimal edit without changing another meter rate', async () => {
  await openEditor();
  fireEvent.change(screen.getByRole('textbox', { name: /Free meter/ }), { target: { value: '0,17' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() => expect(state.updateConfiguration).toHaveBeenCalledOnce());
  expect(state.setRate).toHaveBeenCalledWith({ resourceId: 1, meterId: 2, requestBody: { creditsPerUnit: 17 } });
  expect(state.setRate).toHaveBeenCalledWith({
    resourceId: 1,
    meterId: 1,
    requestBody: { creditsPerUnit: Number.MAX_SAFE_INTEGER },
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
