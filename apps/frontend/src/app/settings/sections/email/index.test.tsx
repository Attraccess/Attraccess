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

  it('sends null when the username is cleared, so an anonymous relay is reachable from here', async () => {
    // `undefined` is dropped by JSON.stringify and the API only writes the key when it is present,
    // so clearing the box used to leave the stored username in place under a success toast. `pass`
    // stays undefined — there, empty genuinely does mean "keep the current one".
    render(<EmailSection />);

    await userEvent.clear(screen.getByLabelText('inputs.user.label'));
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(saveSettings).toHaveBeenCalledWith({
      requestBody: {
        smtp: { ...SMTP, user: null, pass: undefined, passConfigured: undefined },
      },
    });
  });

  it('does not mount dirty on an Outlook instance whose stored transport differs from the constants', () => {
    // Pinning host/port/secure to the Outlook constants made these instances mount with a save bar
    // that had no edit behind it, that Discard could not clear (the pinned values never came from
    // the draft), and whose Save silently rewrote the stored transport.
    vi.mocked(useSettingsServiceGetSystemSettings).mockReturnValue({
      data: {
        smtp: {
          service: 'outlook365',
          host: 'smtp-legacy.office365.com',
          port: 25,
          secure: true,
          user: 'postmaster',
          from: 'noreply@example.org',
          passConfigured: true,
        },
      },
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetSystemSettings>);

    const { container } = render(<EmailSection />);

    expect(saveBar(container)).toBeNull();
    expect(screen.getByLabelText('inputs.host.label')).toHaveValue('smtp-legacy.office365.com');
    expect(screen.getByLabelText('inputs.port.label')).toHaveValue('25');
  });

  it('fills in the Outlook host and port as a discardable edit when the service is switched', async () => {
    const { container } = render(<EmailSection />);

    await userEvent.click(screen.getByRole('button', { name: /service/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'service.outlook' }));

    expect(screen.getByLabelText('inputs.host.label')).toHaveValue('smtp.office365.com');
    expect(screen.getByLabelText('inputs.port.label')).toHaveValue('587');

    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));

    expect(screen.getByLabelText('inputs.host.label')).toHaveValue('mail.example.org');
    expect(saveBar(container)).toBeNull();
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
