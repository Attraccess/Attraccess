import { render } from '@testing-library/react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';
import { it } from 'vitest';
import { vi } from 'vitest';
import { usePasswordPolicyAdminServiceGetAdminPasswordPolicy } from '@attraccess/react-query-client';
import { SecuritySection } from './index';
import type { SecuritySectionTestScope } from './index.test';
import { act } from '@testing-library/react';
import { usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy } from '@attraccess/react-query-client';
import { useSettingsServiceUpdateAuthRateLimitSettings } from '@attraccess/react-query-client';
import { useTwoFactorAuthenticationServiceSetTwoFactorPolicy } from '@attraccess/react-query-client';
import { useUsersServiceSetLocalSignupDomainWhitelist } from '@attraccess/react-query-client';

export function registerStillCommitsAnEditToAHealthyGroupWhileThePolicyQueryIsDown(
  scope: SecuritySectionTestScope,
): void {
  it('still commits an edit to a healthy group while the policy query is down', async () => {
    // Rendering the other groups is not enough — they have to be *savable*. A bare
    // `!isPolicySavable` on the bar was unconditionally true with no policy (`Number.isInteger(
    // undefined)` is false), so the bar came up on a 2FA edit with Save greyed out and nothing
    // saying why, and Discard was the only way out.
    vi.mocked(usePasswordPolicyAdminServiceGetAdminPasswordPolicy).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof usePasswordPolicyAdminServiceGetAdminPasswordPolicy>);

    const { container } = render(<SecuritySection />);

    await userEvent.click(screen.getByRole('button', { name: /twoFactor/i }));
    await userEvent.click(await screen.findByRole('option', { name: /twoFactor.options.all/ }));

    expect(scope.saveBar(container)).toBeInTheDocument();
    expect(scope.saveButton()).not.toBeDisabled();

    await userEvent.click(scope.saveButton());
    expect(scope.saveTwoFactor).toHaveBeenCalledWith({ requestBody: { policy: 'all' } });
    expect(scope.savePolicy).not.toHaveBeenCalled();
  });
}

export function registerStillShowsTheSpinnerWhileTheQueriesAreGenuinelyInFlight(scope: SecuritySectionTestScope): void {
  it('still shows the spinner while the queries are genuinely in flight', () => {
    vi.mocked(usePasswordPolicyAdminServiceGetAdminPasswordPolicy).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof usePasswordPolicyAdminServiceGetAdminPasswordPolicy>);

    render(<SecuritySection />);

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('policy-load-failed')).not.toBeInTheDocument();
  });
}

export function registerUpdatesCachedSettingsAfterSavesAndReportsFailuresForEachBackend(
  scope: SecuritySectionTestScope,
): void {
  it('updates cached settings after saves and reports failures for each backend', async () => {
    render(<SecuritySection />);
    const cases = [
      [
        usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
        scope.POLICY,
        ['policy'],
        'savedToast.title',
        'errorToast.title',
      ],
      [
        useSettingsServiceUpdateAuthRateLimitSettings,
        scope.RATE_LIMIT,
        ['rate-limit'],
        'rateLimit.saved.title',
        'rateLimit.error.title',
      ],
      [
        useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
        { policy: 'all' },
        ['two-factor'],
        'twoFactor.saved.title',
        'twoFactor.error.title',
      ],
      [
        useUsersServiceSetLocalSignupDomainWhitelist,
        undefined,
        ['domains'],
        'domains.saved.title',
        'domains.error.title',
      ],
    ] as const;
    for (const [hook, data, key, successTitle, errorTitle] of cases) {
      const options = vi.mocked(hook).mock.calls.at(-1)?.[0] as {
        onSuccess: (data: unknown) => void;
        onError: () => void;
      };
      await act(async () => options.onSuccess(data));
      expect(scope.feedback.success).toHaveBeenLastCalledWith(expect.objectContaining({ title: successTitle }));
      if (data) expect(scope.feedback.cache).toHaveBeenLastCalledWith(key, data);
      else expect(scope.feedback.invalidate).toHaveBeenCalledWith({ queryKey: key });
      act(() => options.onError());
      expect(scope.feedback.error).toHaveBeenLastCalledWith(expect.objectContaining({ title: errorTitle }));
    }
  });
}
