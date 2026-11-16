import { Spinner } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  useSettingsServiceGetAuthRateLimitSettings,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { PasswordPolicySettings } from './components/PasswordPolicySettings';
import { RateLimitSettings } from './components/RateLimitSettings';
import { SecuritySaveBar } from './components/SecuritySaveBar';
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
  const { data: policy, isLoading: isPolicyLoading } = usePasswordPolicyAdminServiceGetAdminPasswordPolicy();
  const { isLoading: isRateLimitLoading } = useSettingsServiceGetAuthRateLimitSettings();

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
        twoFactorDraft={drafts.twoFactorDraft}
        setTwoFactorDraft={drafts.setTwoFactorDraft}
        domainsDraft={drafts.domainsDraft}
        setDomainsDraft={drafts.setDomainsDraft}
        domainToAdd={drafts.domainToAdd}
        setDomainToAdd={drafts.setDomainToAdd}
      />

      <SubHeading title={t('rateLimit.heading')} description={t('rateLimit.description')} />

      <RateLimitSettings rateDraft={drafts.rateDraft} setRateDraft={drafts.setRateDraft} />

      <SubHeading title={t('policy.heading')} description={t('policy.description')} />

      <PasswordPolicySettings policyDraft={drafts.policyDraft} setPolicyDraft={drafts.setPolicyDraft} />

      <SecuritySaveBar drafts={drafts} />
    </SettingsSection>
  );
}

export default SecuritySection;
