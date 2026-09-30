import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SmtpSettingsForm } from './index';
const state = vi.hoisted(() => ({
  settings: { smtp: {} as Record<string, unknown> },
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
  SmtpServiceType: { SMTP: 'smtp', OUTLOOK365: 'outlook365' },
  useSettingsServiceGetSystemSettingsKey: 'settings',
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
beforeEach(() => {
  vi.clearAllMocks();
  state.loading = false;
  state.settings = {
    smtp: {
      service: 'smtp',
      host: 'smtp.example',
      port: 587,
      secure: false,
      user: 'sender',
      from: 'sender@example.com',
    },
  };
});
afterEach(cleanup);
it('loads stored settings and omits a blank password when saving', () => {
  render(<SmtpSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.host.label')).toHaveValue('smtp.example');
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  expect(state.save).toHaveBeenCalledWith({
    requestBody: {
      smtp: {
        service: 'smtp',
        host: 'smtp.example',
        port: 587,
        secure: false,
        user: 'sender',
        pass: undefined,
        from: 'sender@example.com',
      },
    },
  });
  expect(state.setup).not.toHaveBeenCalled();
  act(() => state.options.onSuccess());
  expect(state.success).toHaveBeenCalled();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['settings'] });
});
it('uses Outlook defaults for missing stored host and port', () => {
  state.settings = { smtp: { service: 'outlook365', from: 'sender@example.com' } };
  render(<SmtpSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByLabelText('inputs.host.label')).toHaveValue('smtp.office365.com');
  expect(screen.getByLabelText('inputs.port.label')).toHaveValue(587);
  expect(screen.getByLabelText('inputs.host.label')).toBeDisabled();
});
it('validates wizard fields, saves through first-time setup, and advances only after success', async () => {
  const next = vi.fn();
  render(<SmtpSettingsForm variant="wizard" endpoint="first-time-setup" onNext={next} />);
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  expect(state.setup).not.toHaveBeenCalled();
  for (const [name, value] of [
    ['host', 'mail.example'],
    ['port', '465'],
    ['from', 'sender@example.com'],
    ['pass', 'new-secret'],
  ]) {
    fireEvent.change(screen.getByLabelText(`inputs.${name}.label`), { target: { value } });
  }
  fireEvent.click(screen.getByRole('switch'));
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }));
  await waitFor(() =>
    expect(state.setup).toHaveBeenCalledWith({
      requestBody: {
        smtp: {
          service: 'smtp',
          host: 'mail.example',
          port: 465,
          secure: true,
          user: undefined,
          pass: 'new-secret',
          from: 'sender@example.com',
        },
      },
    }),
  );
  expect(next).not.toHaveBeenCalled();
  act(() => state.options.onError(new Error('failed')));
  expect(state.error).toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  act(() => state.options.onSuccess());
  expect(next).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['setup-status'] });
  expect(screen.getByLabelText('inputs.pass.label')).toHaveValue('');
});
it('waits for settings before showing editable fields', () => {
  state.loading = true;
  render(<SmtpSettingsForm variant="standalone" endpoint="settings" />);
  expect(screen.getByText('loading')).toBeTruthy();
  expect(screen.queryByLabelText('inputs.host.label')).toBeNull();
});
