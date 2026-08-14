import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
  useSettingsServiceGetAuthRateLimitSettings,
  useSettingsServiceUpdateAuthRateLimitSettings,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
  useUsersServiceGetLocalSignupDomainWhitelist,
  useUsersServiceSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { SecuritySection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  TwoFactorPolicy: { OPTIONAL: 'optional', REQUIRED_FOR_PRIVILEGED: 'privileged', REQUIRED_FOR_ALL: 'all' },
  PasswordPolicyRole: { ADMIN: 'admin' },
  PasswordPolicyAdminService: { previewAdminPasswordPolicy: vi.fn(() => Object.assign(Promise.resolve({ ok: true, errors: [] }), { cancel: vi.fn() })) },
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy: vi.fn(),
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy: vi.fn(),
  usePasswordPolicyAdminServiceListPasswordPolicyOverrides: vi.fn(() => ({ data: [] })),
  usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePasswordPolicyAdminServiceDeletePasswordPolicyOverride: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSettingsServiceGetAuthRateLimitSettings: vi.fn(),
  useSettingsServiceUpdateAuthRateLimitSettings: vi.fn(),
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy: vi.fn(),
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy: vi.fn(),
  useUsersServiceGetLocalSignupDomainWhitelist: vi.fn(),
  useUsersServiceSetLocalSignupDomainWhitelist: vi.fn(),
  UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn: () => ['policy'],
  UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn: () => ['overrides'],
  UseSettingsServiceGetAuthRateLimitSettingsKeyFn: () => ['rate-limit'],
  UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn: () => ['two-factor'],
  UseUsersServiceGetLocalSignupDomainWhitelistKeyFn: () => ['domains'],
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(() => Promise.resolve()), setQueryData: vi.fn() }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));

const POLICY = {
  minLength: 12,
  maxLength: 64,
  minZxcvbnScore: 3,
  historySize: 5,
  rotationDays: 0,
  allowAllUnicode: true,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false,
  checkHIBP: true,
  checkCommonPasswords: true,
};

const RATE_LIMIT = {
  maxAttempts: 5,
  windowSeconds: 300,
  lockoutDurationSeconds: 900,
  exponentialBackoff: true,
  backoffMultiplier: 2,
};

const savePolicy = vi.fn();
const saveRateLimit = vi.fn();
const saveTwoFactor = vi.fn();
const saveDomains = vi.fn();

const idle = (mutate: unknown) => ({ mutate, isPending: false });

describe('SecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePasswordPolicyAdminServiceGetAdminPasswordPolicy).mockReturnValue({
      data: POLICY,
      isLoading: false,
    } as ReturnType<typeof usePasswordPolicyAdminServiceGetAdminPasswordPolicy>);
    vi.mocked(useSettingsServiceGetAuthRateLimitSettings).mockReturnValue({
      data: RATE_LIMIT,
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetAuthRateLimitSettings>);
    vi.mocked(useTwoFactorAuthenticationServiceGetTwoFactorPolicy).mockReturnValue({
      data: { policy: 'optional' },
    } as ReturnType<typeof useTwoFactorAuthenticationServiceGetTwoFactorPolicy>);
    vi.mocked(useUsersServiceGetLocalSignupDomainWhitelist).mockReturnValue({
      data: ['example.org'],
      isLoading: false,
    } as unknown as ReturnType<typeof useUsersServiceGetLocalSignupDomainWhitelist>);

    vi.mocked(usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy).mockReturnValue(
      idle(savePolicy) as unknown as ReturnType<typeof usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy>,
    );
    vi.mocked(useSettingsServiceUpdateAuthRateLimitSettings).mockReturnValue(
      idle(saveRateLimit) as unknown as ReturnType<typeof useSettingsServiceUpdateAuthRateLimitSettings>,
    );
    vi.mocked(useTwoFactorAuthenticationServiceSetTwoFactorPolicy).mockReturnValue(
      idle(saveTwoFactor) as unknown as ReturnType<typeof useTwoFactorAuthenticationServiceSetTwoFactorPolicy>,
    );
    vi.mocked(useUsersServiceSetLocalSignupDomainWhitelist).mockReturnValue(
      idle(saveDomains) as unknown as ReturnType<typeof useUsersServiceSetLocalSignupDomainWhitelist>,
    );
  });

  const saveBar = (container: HTMLElement) => container.querySelector('[data-slot="settings-save-bar"]');
  const saveButton = () => screen.getByRole('button', { name: 'saveBar.save' });

  it('absorbs all four former destinations into one section', () => {
    // Login throttling was an inline form on /users/security, the password policy a page of its
    // own, 2FA and signup domains header modals. If any of these stops rendering here, that
    // content has been orphaned rather than moved.
    render(<SecuritySection />);

    expect(screen.getByLabelText('twoFactor.label')).toBeInTheDocument();
    expect(screen.getByTestId('signup-domains-row')).toBeInTheDocument();
    expect(screen.getByLabelText('rateLimit.fields.maxAttempts.label')).toBeInTheDocument();
    expect(screen.getByTestId('policy-row-minLength')).toBeInTheDocument();
    expect(screen.getByTestId('policy-row-checkHIBP')).toBeInTheDocument();
    expect(screen.getByTestId('policy-overrides-table')).toBeInTheDocument();
  });

  it('reports a failed policy query instead of spinning forever, and keeps the rest editable', () => {
    // On error `isLoading` goes false while the data stays undefined. Folding `!policy` into the
    // loading gate rendered the *loading* state permanently — and took 2FA, the domain whitelist and
    // throttling down with it, none of which come from this query.
    vi.mocked(usePasswordPolicyAdminServiceGetAdminPasswordPolicy).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof usePasswordPolicyAdminServiceGetAdminPasswordPolicy>);

    render(<SecuritySection />);

    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('policy-load-failed')).toHaveTextContent('policy.loadFailed');
    expect(screen.queryByTestId('policy-row-minLength')).not.toBeInTheDocument();

    // The three unrelated groups are still reachable.
    expect(screen.getByLabelText('twoFactor.label')).toBeInTheDocument();
    expect(screen.getByTestId('signup-domains-row')).toBeInTheDocument();
    expect(screen.getByLabelText('rateLimit.fields.maxAttempts.label')).toBeInTheDocument();
  });

  it('reports a failed throttling query without taking the password policy with it', () => {
    vi.mocked(useSettingsServiceGetAuthRateLimitSettings).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetAuthRateLimitSettings>);

    render(<SecuritySection />);

    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('rate-limit-load-failed')).toHaveTextContent('rateLimit.loadFailed');
    expect(screen.queryByLabelText('rateLimit.fields.maxAttempts.label')).not.toBeInTheDocument();
    expect(screen.getByTestId('policy-row-minLength')).toBeInTheDocument();
  });

  it('still shows the spinner while the queries are genuinely in flight', () => {
    vi.mocked(usePasswordPolicyAdminServiceGetAdminPasswordPolicy).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof usePasswordPolicyAdminServiceGetAdminPasswordPolicy>);

    render(<SecuritySection />);

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('policy-load-failed')).not.toBeInTheDocument();
  });

  it('keeps the strength preview in the aside, not the content column', () => {
    const { container } = render(<SecuritySection />);

    expect(container.querySelector('[data-slot="settings-aside"]')).toContainElement(
      screen.getByTestId('policy-preview-input'),
    );
  });

  it('shows no save bar until something is edited', () => {
    const { container } = render(<SecuritySection />);

    expect(saveBar(container)).toBeNull();
  });

  it('commits only the group that is dirty', async () => {
    // Four backends sit behind one bar. Saving a throttling edit must not also PATCH the password
    // policy with values this tab happens to be holding.
    const { container } = render(<SecuritySection />);

    const attempts = screen.getByLabelText('rateLimit.fields.maxAttempts.label');
    await userEvent.clear(attempts);
    await userEvent.type(attempts, '9');
    await userEvent.tab();

    expect(saveBar(container)).toBeInTheDocument();
    await userEvent.click(saveButton());

    expect(saveRateLimit).toHaveBeenCalledWith({
      requestBody: { ...RATE_LIMIT, maxAttempts: 9 },
    });
    expect(savePolicy).not.toHaveBeenCalled();
    expect(saveTwoFactor).not.toHaveBeenCalled();
    expect(saveDomains).not.toHaveBeenCalled();
  });

  it('puts a diff in front of a password-policy change, and sends only the changed keys', async () => {
    // The one group here that can invalidate every existing password at once. The PATCH carries
    // only what changed, so an untouched field cannot be clobbered by a stale value this tab loaded.
    render(<SecuritySection />);

    const minLength = screen.getByLabelText('fields.minLength.label');
    await userEvent.clear(minLength);
    await userEvent.type(minLength, '16');
    await userEvent.tab();

    await userEvent.click(saveButton());
    expect(savePolicy).not.toHaveBeenCalled();

    const diff = screen.getByTestId('policy-diff-table');
    expect(diff).toHaveTextContent('12');
    expect(diff).toHaveTextContent('16');

    await userEvent.click(screen.getByTestId('policy-diff-confirm'));
    expect(savePolicy).toHaveBeenCalledWith({ requestBody: { minLength: 16 } });
  });

  it('seeds the overrides editor from the saved policy, not an unsaved edit', async () => {
    // The modal commits on its own, and inheritance resolves server-side against what is stored.
    // Passing the merged draft made the "inherit" hint name a number no role would get, and turning
    // an override on would pin it to a value the operator could still Discard.
    render(<SecuritySection />);

    const minLength = screen.getByLabelText('fields.minLength.label');
    await userEvent.clear(minLength);
    await userEvent.type(minLength, '16');
    await userEvent.tab();

    await userEvent.click(screen.getByTestId('policy-override-edit-admin'));
    fireEvent.click(
      screen.getByTestId('override-admin-minLength-toggle').querySelector('[data-slot="switch-control"]') as HTMLElement,
    );

    expect(screen.getByTestId('override-admin-minLength-value')).toHaveValue('12');
  });

  it('keeps the bar reachable when a number is cleared, with Save blocked', async () => {
    // Clearing a NumberField yields NaN. Treating that as "not dirty" would unmount the bar and
    // strand the operator with an empty field and no way back to the saved value.
    const { container } = render(<SecuritySection />);

    await userEvent.clear(screen.getByLabelText('rateLimit.fields.windowSeconds.label'));
    await userEvent.tab();

    expect(saveBar(container)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));

    expect(screen.getByLabelText('rateLimit.fields.windowSeconds.label')).toHaveValue('300');
    expect(saveBar(container)).toBeNull();
  });

  it('adds and removes signup domains without touching the server until Save', async () => {
    render(<SecuritySection />);

    await userEvent.type(screen.getByRole('textbox', { name: 'domains.addLabel' }), 'new.example{Enter}');

    expect(screen.getByTestId('signup-domain-new.example')).toBeInTheDocument();
    expect(saveDomains).not.toHaveBeenCalled();

    await userEvent.click(saveButton());
    expect(saveDomains).toHaveBeenCalledWith({ requestBody: ['example.org', 'new.example'] });
  });

  it('refuses to edit the domain list before it has loaded', async () => {
    // PUT is a full replace. While the whitelist is undefined the fallback is `[]`, so an add would
    // stage a one-element draft that pins — and Save would delete every domain the instance has.
    vi.mocked(useUsersServiceGetLocalSignupDomainWhitelist).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useUsersServiceGetLocalSignupDomainWhitelist>);

    const { container } = render(<SecuritySection />);

    expect(screen.queryByRole('textbox', { name: 'domains.addLabel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('signup-domains-row')).toHaveTextContent('domains.loading');
    expect(saveBar(container)).toBeNull();
  });

  it('says so rather than showing an empty list when the whitelist cannot be loaded', () => {
    // An errored query leaves `data` undefined too. Rendering that as "no domains configured" is a
    // lie that one add and a Save turns into data loss — and blocking the whole section behind a
    // spinner that will never resolve is no better.
    vi.mocked(useUsersServiceGetLocalSignupDomainWhitelist).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useUsersServiceGetLocalSignupDomainWhitelist>);

    render(<SecuritySection />);

    expect(screen.getByTestId('signup-domains-row')).toHaveTextContent('domains.loadFailed');
    expect(screen.queryByRole('textbox', { name: 'domains.addLabel' })).not.toBeInTheDocument();
    // The rest of the section is still usable.
    expect(screen.getByTestId('policy-row-minLength')).toBeInTheDocument();
  });

  it('blocks Save on a non-integer where the API validates @IsInt()', async () => {
    // None of these steppers sets a `step`, so 2.5 is typeable. Number.isFinite let it through to a
    // 400 rendered as a generic toast naming no field.
    const { container } = render(<SecuritySection />);

    const attempts = screen.getByLabelText('rateLimit.fields.maxAttempts.label');
    await userEvent.clear(attempts);
    await userEvent.type(attempts, '2.5');
    await userEvent.tab();

    expect(saveBar(container)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(saveRateLimit).not.toHaveBeenCalled();
  });

  it('does not clobber an unsaved edit when a background refetch lands', async () => {
    const { rerender } = render(<SecuritySection />);

    const attempts = screen.getByLabelText('rateLimit.fields.maxAttempts.label');
    await userEvent.clear(attempts);
    await userEvent.type(attempts, '7');
    await userEvent.tab();

    vi.mocked(useSettingsServiceGetAuthRateLimitSettings).mockReturnValue({
      data: RATE_LIMIT,
      isLoading: false,
    } as ReturnType<typeof useSettingsServiceGetAuthRateLimitSettings>);
    rerender(<SecuritySection />);

    expect(screen.getByLabelText('rateLimit.fields.maxAttempts.label')).toHaveValue('7');
  });
});
