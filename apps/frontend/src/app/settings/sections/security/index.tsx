import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  useGetAdminPasswordPolicy,
  useListPasswordPolicyOverrides,
  useGetAuthRateLimitSettings,
  useGetTwoFactorPolicy,
  useGetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { NetworkRestrictionCard } from './networkRestriction/NetworkRestrictionCard';
import { PasswordPolicySettings } from './components/PasswordPolicySettings';
import { RateLimitSettings } from './components/RateLimitSettings';
import { SecuritySaveBar } from './components/SecuritySaveBar';
import { SignupDomainsRow } from './components/SignupDomainsRow';
import { SubHeading } from './components/SubHeading';
import { TwoFactorSettings } from './components/TwoFactorSettings';
import { PasswordPreview } from './PasswordPreview';
import { useSecurityDrafts } from './useSecurityDrafts';
import en from './en.json';
import de from './de.json';

/**
 * Everything that decides who gets in and on what terms: sign-in throttling, the password policy,
 * the two-factor requirement and which domains may self-register.
 *
 * These were four separate destinations — an inline form on `/users/security`, a whole page at
 * `/users/security/password-policy`, and two header modals — reached four different ways, none of
 * which told an operator that they interact. One section, one save bar.
 */
export function SecuritySection() {
  const { t } = useTranslations({ en, de });
  const drafts = useSecurityDrafts();
  // Every query of the section starts here, above the early return, so all five go out in one
  // parallel round and the rows below get their data as props. Subscribing in the rows instead
  // delayed 2FA, the whitelist and the overrides until the gate opened, and refetched the policy
  // and the rate limit a second time on mount (the shared client has no `staleTime`).
  const { data: policy, isLoading: isPolicyLoading } = useGetAdminPasswordPolicy();
  const { data: rateLimit, isLoading: isRateLimitLoading } = useGetAuthRateLimitSettings();
  const { data: twoFactor } = useGetTwoFactorPolicy();
  const { data: savedDomains, isLoading: isDomainsLoading } = useGetLocalSignupDomainWhitelist();
  const { data: overrides = [] } = useListPasswordPolicyOverrides();

  // Loading only. Folding `!policy || !rateLimit` in here conflated "not arrived yet" with "arrived
  // empty": on error `isLoading` goes false while the data stays undefined, so the spinner became
  // permanent — and it took 2FA, the domain whitelist and the overrides down with it, none of which
  // come from these two queries. Same distinction `areDomainsReady` and `areLimitsReady` draw.
  if (isPolicyLoading || isRateLimitLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }
  // Everything the operator needs while editing is on the left; the aside is the one thing that is
  // purely reference — a live, server-evaluated read on the policy being written. Without a policy
  // there is nothing to preview against.
  const aside = policy ? <PasswordPreview policy={{ ...policy, ...drafts.policyDraft }} /> : undefined;

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <SubHeading title={t('access.heading')} description={t('access.description')} />

      <TwoFactorSettings
        savedPolicy={twoFactor?.policy}
        twoFactorDraft={drafts.twoFactorDraft}
        setTwoFactorDraft={drafts.setTwoFactorDraft}
      >
        <SignupDomainsRow
          savedDomains={savedDomains}
          isDomainsLoading={isDomainsLoading}
          domainsDraft={drafts.domainsDraft}
          setDomainsDraft={drafts.setDomainsDraft}
          domainToAdd={drafts.domainToAdd}
          setDomainToAdd={drafts.setDomainToAdd}
        />
      </TwoFactorSettings>

      <SubHeading title={t('rateLimit.heading')} description={t('rateLimit.description')} />

      <RateLimitSettings rateLimit={rateLimit} rateDraft={drafts.rateDraft} setRateDraft={drafts.setRateDraft} />

      <SubHeading title={t('policy.heading')} description={t('policy.description')} />

      <PasswordPolicySettings
        policy={policy}
        overrides={overrides}
        policyDraft={drafts.policyDraft}
        setPolicyDraft={drafts.setPolicyDraft}
      />

      <NetworkRestrictionCard />

      <SecuritySaveBar
        drafts={drafts}
        policy={policy}
        rateLimit={rateLimit}
        twoFactorPolicy={twoFactor?.policy}
        savedDomains={savedDomains}
      />
    </SettingsSection>
  );
}

export default SecuritySection;
