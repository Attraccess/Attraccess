import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TwoFactorCard } from './index';
const state = vi.hoisted(() => ({
  status: { enabled: false, required: true },
  loading: false,
  start: vi.fn(),
  verify: vi.fn(),
  disable: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../../components/toastProvider', () => ({ useToastMessage: () => ({ showToast: state.toast }) }));
vi.mock('react-qrcode-logo', () => ({ QRCode: ({ value }: { value: string }) => <output>{value}</output> }));
vi.mock('@attraccess/react-query-client', () => ({
  useTwoFactorAuthenticationServiceGetTwoFactorStatus: () => ({
    data: state.status,
    isLoading: state.loading,
    refetch: state.refetch,
  }),
  useTwoFactorAuthenticationServiceSetupTwoFactor: () => ({ mutateAsync: state.start }),
  useTwoFactorAuthenticationServiceVerifyTwoFactor: () => ({ mutateAsync: state.verify }),
  useTwoFactorAuthenticationServiceDisableTwoFactor: () => ({ mutateAsync: state.disable }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.status = { enabled: false, required: true };
  state.loading = false;
  state.start.mockResolvedValue({ secret: 'TESTSECRET', otpauthUrl: 'otpauth://totp/Test' });
  state.verify.mockResolvedValue(undefined);
  state.disable.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows policy requirements and completes verified enrollment', async () => {
  render(<TwoFactorCard />);
  expect(screen.getByText('policy.requiredWarning')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'setup.startButton' }));
  expect(await screen.findByDisplayValue('TESTSECRET')).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'setup.verifyButton' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('setup.codeLabel'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'setup.verifyButton' }));
  await waitFor(() => expect(state.verify).toHaveBeenCalledWith({ requestBody: { code: '123456' } }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.enabled', type: 'success' }));
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(screen.queryByDisplayValue('TESTSECRET')).toBeNull();
});
it('keeps enrollment details after verification failure and allows regeneration', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.verify.mockRejectedValueOnce(new Error('invalid code'));
  render(<TwoFactorCard />);
  fireEvent.click(screen.getByRole('button', { name: 'setup.startButton' }));
  await screen.findByDisplayValue('TESTSECRET');
  fireEvent.change(screen.getByLabelText('setup.codeLabel'), { target: { value: '111111' } });
  fireEvent.click(screen.getByRole('button', { name: 'setup.verifyButton' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.verifyFailed', type: 'error' }));
  expect(state.refetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'setup.regenerateButton' }));
  await waitFor(() => expect(state.start).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('button', { name: 'setup.verifyButton' })).toBeDisabled());
});
it('reports setup failure without exposing an incomplete setup', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.start.mockRejectedValueOnce(new Error('network'));
  render(<TwoFactorCard />);
  fireEvent.click(screen.getByRole('button', { name: 'setup.startButton' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.setupFailed', type: 'error' }));
  expect(screen.queryByLabelText('setup.codeLabel')).toBeNull();
});
it('requires a code to disable, preserves it on failure and clears it after success', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  state.status.enabled = true;
  state.disable.mockRejectedValueOnce(new Error('invalid code'));
  render(<TwoFactorCard />);
  expect(screen.queryByText('policy.requiredWarning')).toBeNull();
  expect(screen.getByRole('button', { name: 'disable.button' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('disable.codeLabel'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'disable.button' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'errors.disableFailed', type: 'error' }));
  expect(screen.getByLabelText('disable.codeLabel')).toHaveValue('123456');
  fireEvent.click(screen.getByRole('button', { name: 'disable.button' }));
  await waitFor(() => expect(state.toast).toHaveBeenCalledWith({ title: 'success.disabled', type: 'success' }));
  expect(state.disable).toHaveBeenLastCalledWith({ requestBody: { code: '123456' } });
  expect(screen.getByLabelText('disable.codeLabel')).toHaveValue('');
});
it('does not show enrollment actions before status has loaded', () => {
  state.loading = true;
  render(<TwoFactorCard />);
  expect(screen.queryByRole('button')).toBeNull();
});
