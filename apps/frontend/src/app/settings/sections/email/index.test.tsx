import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useSettingsServiceGetSystemSettings,
  useSettingsServiceUpdateSystemSettings,
} from '@attraccess/react-query-client';
import { EmailSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  SmtpServiceType: { SMTP: 'smtp', OUTLOOK365: 'outlook365' },
  useSettingsServiceGetSystemSettings: vi.fn(),
  UseSettingsServiceGetSystemSettingsKeyFn: () => ['settings'],
  useSettingsServiceUpdateSystemSettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

const saveSettings = vi.fn();

const SMTP = {
  service: 'smtp',
  host: 'mail.example.org',
  port: 587,
  secure: false,
  user: 'postmaster',
  from: 'noreply@example.org',
  passConfigured: true,
};

describe('EmailSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: { smtp: SMTP },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);
    vi.mocked(useSettingsServiceUpdateSystemSettings).mockReturnValue({
      mutate: saveSettings,
      isPending: false,
    } as unknown as ReturnType<typeof useSettingsServiceUpdateSystemSettings>);
  });

  const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');

  it('puts the password-configured chip in the aside, not the form', () => {
    const { container } = render(<EmailSection />);

    expect(container.querySelector('[data-slot="settings-aside"]')).toHaveTextContent('passwordStatus.configured');
    expect(container.querySelector('[data-slot="settings-content"]')).not.toHaveTextContent(
      'passwordStatus.configured',
    );
  });

  it('treats an empty password box as "keep the current one"', () => {
    // The API never returns the stored password, so the field starts empty on every mount. If that
    // counted as an edit, the bar would be dirty from first paint and Save would post an empty
    // password, wiping the credential.
    const { container } = render(<EmailSection />);

    expect(screen.getByLabelText('inputs.pass.label')).toHaveValue('');
    expect(saveBar(container)).toBeNull();
  });

  it('omits an untouched password from the payload', async () => {
    render(<EmailSection />);

    await userEvent.type(screen.getByLabelText('inputs.from.label'), '.uk');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        smtp: { ...SMTP, from: 'noreply@example.org.uk', pass: undefined, passConfigured: undefined },
      },
    });
  });

  it('refuses to save a port outside the valid range, and says why', async () => {
    render(<EmailSection />);

    const port = screen.getByLabelText('inputs.port.label');
    await userEvent.clear(port);
    await userEvent.type(port, '70000');
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).not.toHaveBeenCalled();
    expect(screen.getByText('inputs.port.errors.invalid')).toBeInTheDocument();
  });
});
