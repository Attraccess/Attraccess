import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceEnrollment, parseEnrollmentQr } from './index';
const state = vi.hoisted(() => ({
  permitted: true,
  approveReader: vi.fn(),
  approveCompanion: vi.fn(),
  scan: undefined as ((data: { rawValue: string }[]) => void) | undefined,
  cameraError: undefined as (() => void) | undefined,
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => state.permitted }) }));
vi.mock('@attraccess/react-query-client', async (original) => ({
  ...(await original<object>()),
  AttractapService: { approveReaderEnrollment: state.approveReader },
  CompanionDevicesService: { approveCompanionEnrollment: state.approveCompanion },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@yudiel/react-qr-scanner', () => ({
  Scanner: (props: { onScan: typeof state.scan; onError: typeof state.cameraError }) => {
    state.scan = props.onScan;
    state.cameraError = props.onError;
    return <span>Camera</span>;
  },
}));
function mount(type: 'reader' | 'companion' = 'reader') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <DeviceEnrollment type={type} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.permitted = true;
  state.approveReader.mockResolvedValue({ id: 1 });
  state.approveCompanion.mockResolvedValue({ id: 2 });
});
afterEach(cleanup);
describe('device approval', () => {
  it('only accepts the exact version and intended device type', () => {
    expect(parseEnrollmentQr('attraccess-enroll:v1:reader:ABC-123', 'reader')).toBe('ABC-123');
    for (const value of [
      'https://evil.example/ABC-123',
      'attraccess-enroll:v2:reader:ABC-123',
      'attraccess-enroll:v1:companion:ABC-123',
    ])
      expect(parseEnrollmentQr(value, 'reader')).toBeNull();
  });
  it('hides enrollment without device-management permission', () => {
    state.permitted = false;
    mount();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('requires explicit approval after entering a normalized code', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'add.reader' }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'abc123' } });
    expect(state.approveReader).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'approve' }));
    await waitFor(() => expect(state.approveReader).toHaveBeenCalledWith({ requestBody: { code: 'ABC-123' } }));
    expect(await screen.findByText('states.success')).toBeInTheDocument();
    expect(state.approveCompanion).not.toHaveBeenCalled();
  });
});

it('fills a valid scanned code without approving and rejects other device types', async () => {
  mount('companion');
  fireEvent.click(screen.getByRole('button', { name: 'add.companion' }));
  fireEvent.click(await screen.findByRole('button', { name: 'scan' }));
  const { act } = await import('@testing-library/react');
  act(() => state.scan?.([{ rawValue: 'attraccess-enroll:v1:reader:ABC-123' }]));
  expect(screen.getByText('states.invalidScan')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('');
  act(() => state.scan?.([{ rawValue: 'attraccess-enroll:v1:companion:ABC-123' }]));
  expect(screen.getByRole('textbox')).toHaveValue('ABC-123');
  expect(state.approveCompanion).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'approve' }));
  await waitFor(() => expect(state.approveCompanion).toHaveBeenCalledWith({ requestBody: { code: 'ABC-123' } }));
});

it('keeps manual entry available when camera permission is denied', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'add.reader' }));
  fireEvent.click(await screen.findByRole('button', { name: 'scan' }));
  const { act } = await import('@testing-library/react');
  act(() => state.cameraError?.());
  expect(screen.getByText('states.camera')).toBeInTheDocument();
  expect(screen.queryByText('Camera')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
});
