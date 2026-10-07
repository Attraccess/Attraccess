import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
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
import { registerAbsorbsAllFourFormerDestinationsIntoOneSection } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerReportsAFailedPolicyQueryInsteadOfSpinningForeverAndKeepsTheRestEditable } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerStillCommitsAnEditToAHealthyGroupWhileThePolicyQueryIsDown } from './index.still-commits-an-edit-to-a-healthy-group-while-the-policy-query-is-down.test-cases';
import { registerReportsAFailedThrottlingQueryWithoutTakingThePasswordPolicyWithIt } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerStillShowsTheSpinnerWhileTheQueriesAreGenuinelyInFlight } from './index.still-commits-an-edit-to-a-healthy-group-while-the-policy-query-is-down.test-cases';
import { registerKeepsTheStrengthPreviewInTheAsideNotTheContentColumn } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerCommitsOnlyTheGroupThatIsDirty } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerPutsADiffInFrontOfAPasswordPolicyChangeAndSendsOnlyTheChangedKeys } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerSeedsTheOverridesEditorFromTheSavedPolicyNotAnUnsavedEdit } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerKeepsTheBarReachableWhenANumberIsClearedWithSaveBlocked } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerAddsAndRemovesSignupDomainsWithoutTouchingTheServerUntilSave } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerRefusesToEditTheDomainListBeforeItHasLoaded } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerSaysSoRatherThanShowingAnEmptyListWhenTheWhitelistCannotBeLoaded } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerBlocksSaveOnANonIntegerWhereTheApiValidatesIsInt } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerDoesNotClobberAnUnsavedEditWhenABackgroundRefetchLands } from './index.absorbs-all-four-former-destinations-into-one-section.test-cases';
import { registerUpdatesCachedSettingsAfterSavesAndReportsFailuresForEachBackend } from './index.still-commits-an-edit-to-a-healthy-group-while-the-policy-query-is-down.test-cases';

const feedback = vi.hoisted(() => ({
  invalidate: vi.fn(() => Promise.resolve()),
  cache: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@attraccess/react-query-client', () => ({
  TwoFactorPolicy: { OPTIONAL: 'optional', REQUIRED_FOR_PRIVILEGED: 'privileged', REQUIRED_FOR_ALL: 'all' },
  PasswordPolicyRole: { ADMIN: 'admin' },
  PasswordPolicyAdminService: {
    previewAdminPasswordPolicy: vi.fn(() =>
      Object.assign(Promise.resolve({ ok: true, errors: [] }), { cancel: vi.fn() }),
    ),
  },
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
  useQueryClient: () => ({ invalidateQueries: feedback.invalidate, setQueryData: feedback.cache }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: feedback.success, error: feedback.error, apiError: vi.fn() }),
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
  defineSecuritySectionTests();
});

export function defineSecuritySectionTests() {
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
  const scope = {
    get saveBar() {
      return saveBar;
    },
    get saveButton() {
      return saveButton;
    },
    get saveTwoFactor() {
      return saveTwoFactor;
    },
    get savePolicy() {
      return savePolicy;
    },
    get saveRateLimit() {
      return saveRateLimit;
    },
    get RATE_LIMIT() {
      return RATE_LIMIT;
    },
    get saveDomains() {
      return saveDomains;
    },
    get POLICY() {
      return POLICY;
    },
    get feedback() {
      return feedback;
    },
  };

  registerAbsorbsAllFourFormerDestinationsIntoOneSection(scope);

  registerReportsAFailedPolicyQueryInsteadOfSpinningForeverAndKeepsTheRestEditable(scope);

  registerStillCommitsAnEditToAHealthyGroupWhileThePolicyQueryIsDown(scope);

  registerReportsAFailedThrottlingQueryWithoutTakingThePasswordPolicyWithIt(scope);

  registerStillShowsTheSpinnerWhileTheQueriesAreGenuinelyInFlight(scope);

  registerKeepsTheStrengthPreviewInTheAsideNotTheContentColumn(scope);

  it('shows no save bar until something is edited', () => {
    const { container } = render(<SecuritySection />);

    expect(saveBar(container)).toBeNull();
  });

  registerCommitsOnlyTheGroupThatIsDirty(scope);

  registerPutsADiffInFrontOfAPasswordPolicyChangeAndSendsOnlyTheChangedKeys(scope);

  registerSeedsTheOverridesEditorFromTheSavedPolicyNotAnUnsavedEdit(scope);

  registerKeepsTheBarReachableWhenANumberIsClearedWithSaveBlocked(scope);

  registerAddsAndRemovesSignupDomainsWithoutTouchingTheServerUntilSave(scope);

  registerRefusesToEditTheDomainListBeforeItHasLoaded(scope);

  registerSaysSoRatherThanShowingAnEmptyListWhenTheWhitelistCannotBeLoaded(scope);

  registerBlocksSaveOnANonIntegerWhereTheApiValidatesIsInt(scope);

  registerDoesNotClobberAnUnsavedEditWhenABackgroundRefetchLands(scope);
  registerUpdatesCachedSettingsAfterSavesAndReportsFailuresForEachBackend(scope);

  return scope;
}

export type SecuritySectionTestScope = ReturnType<typeof defineSecuritySectionTests>;
