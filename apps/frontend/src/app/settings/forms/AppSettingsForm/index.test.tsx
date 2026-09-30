import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppSettingsForm } from './index';
const state = vi.hoisted(() => ({
  settings: { app: {} as Record<string, unknown> },
  loading: false,
  save: vi.fn(),
  setup: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: () => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, apiError: state.error }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', () => ({
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  UseSettingsServiceGetFirstTimeSetupStatusKeyFn: () => ['setup-status'],
  useSettingsServiceGetSystemSettings: () => ({ data: state.settings, isLoading: state.loading }),
  useSettingsServiceUpdateSystemSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.save };
  },
  useSettingsServiceApplyFirstTimeSetupSettings: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.setup };
  },
}));
vi.mock('../../../../components/CommunityLicenseButton', () => ({ CommunityLicenseButton: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.settings = { app: { url: 'https://app.example', publicInternetUrl: 'https://public.example' } };
});
afterEach(cleanup);
it('loads existing URLs and preserves the stored license when the secret field is empty', () => {
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.url.label')).toHaveValue('https://app.example');
  fireEvent.change(screen.getByLabelText('inputs.publicInternetUrl.label'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith({
    requestBody: { app: { url: 'https://app.example', publicInternetUrl: undefined, licenseKey: undefined } },
  });
});
it('submits a new license and clears it only after successful save', () => {
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  fireEvent.change(screen.getByLabelText('inputs.licenseKey.label'), { target: { value: ' new-license ' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith({
    requestBody: {
      app: { url: 'https://app.example', publicInternetUrl: 'https://public.example', licenseKey: 'new-license' },
    },
  });
  act(() => state.options.onError(new Error('failed')));
  expect(state.error).toHaveBeenCalled();
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue(' new-license ');
  act(() => state.options.onSuccess());
  expect(screen.getByLabelText('inputs.licenseKey.label')).toHaveValue('');
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
});
it('validates the wizard URL and advances after first-time setup succeeds', () => {
  const next = vi.fn();
  render(<AppSettingsForm variant="wizard" endpoint="first-time-setup" onNext={next} />);
  expect(screen.queryByLabelText('inputs.licenseKey.label')).toBeNull();
  fireEvent.change(screen.getByLabelText('inputs.url.label'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('inputs.url.label'), { target: { value: 'https://configured.example' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).toHaveBeenCalledWith(
    expect.objectContaining({
      requestBody: {
        app: { url: 'https://configured.example', publicInternetUrl: window.location.origin, licenseKey: undefined },
      },
    }),
  );
  expect(next).not.toHaveBeenCalled();
  act(() => state.options.onSuccess());
  expect(next).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['setup-status'] });
});
it('shows loading state before settings arrive', () => {
  state.loading = true;
  render(<AppSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByText('loading')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
