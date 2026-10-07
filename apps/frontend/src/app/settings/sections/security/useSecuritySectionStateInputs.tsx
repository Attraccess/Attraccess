import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuthRateLimitSettingsDto,
  PasswordPolicyDto,
  PasswordPolicyRole,
  TwoFactorPolicy,
  UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn,
  UseSettingsServiceGetAuthRateLimitSettingsKeyFn,
  UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn,
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  usePasswordPolicyAdminServiceListPasswordPolicyOverrides,
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
  useSettingsServiceGetAuthRateLimitSettings,
  useSettingsServiceUpdateAuthRateLimitSettings,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
  useUsersServiceGetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { POLICY_FIELD_KEYS } from './policy-fields';
import en from './en.json';
import de from './de.json';
import { getRateLimitDraft } from './index.helpers';

export function useSecuritySectionStateInputs() {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();

  const { data: policy, isLoading: isPolicyLoading } = usePasswordPolicyAdminServiceGetAdminPasswordPolicy();
  const { data: rateLimit, isLoading: isRateLimitLoading } = useSettingsServiceGetAuthRateLimitSettings();
  const { data: twoFactor } = useTwoFactorAuthenticationServiceGetTwoFactorPolicy();
  const { data: savedDomains, isLoading: isDomainsLoading } = useUsersServiceGetLocalSignupDomainWhitelist();
  const { data: overrides = [] } = usePasswordPolicyAdminServiceListPasswordPolicyOverrides();

  // Derived drafts throughout: an untouched field falls back to the server's value, so a background
  // refetch cannot overwrite an edit the operator has not saved yet (ATT-868).
  const [policyDraft, setPolicyDraft] = useState<Partial<PasswordPolicyDto>>({});
  const [rateDraft, setRateDraft] = useState<Partial<AuthRateLimitSettingsDto>>({});
  const [twoFactorDraft, setTwoFactorDraft] = useState<TwoFactorPolicy | undefined>();
  const [domainsDraft, setDomainsDraft] = useState<string[] | undefined>();

  const [domainToAdd, setDomainToAdd] = useState('');
  const [editingRole, setEditingRole] = useState<PasswordPolicyRole | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const overridesByRole = useMemo(() => new Map(overrides.map((row) => [row.role, row])), [overrides]);

  const policyValue = <K extends keyof PasswordPolicyDto>(key: K): PasswordPolicyDto[K] =>
    (policyDraft[key] ?? policy?.[key]) as PasswordPolicyDto[K];
  const {
    value: rateValue,
    exponentialBackoff,
    isDirty: isRateDirty,
    isSavable: isRateSavable,
  } = getRateLimitDraft(rateLimit, rateDraft);
  const twoFactorValue = twoFactorDraft ?? twoFactor?.policy;
  // `savedDomains === undefined` means the whitelist has not arrived — loading, or the request
  // failed. It must not read as an empty list: PUT is a full replace, so staging one addition off
  // an empty fallback and saving would delete every domain the instance actually has. The row shows
  // its own state instead of the section blocking on it, because a failed request would otherwise
  // strand the whole of Security behind a spinner that never resolves.
  const areDomainsReady = savedDomains !== undefined;
  const domains = domainsDraft ?? savedDomains ?? [];

  const policyDiff = useMemo(() => {
    if (!policy) return [];
    return POLICY_FIELD_KEYS.filter((key) => policyDraft[key] !== undefined && policyDraft[key] !== policy[key]).map(
      (key) => ({
        field: String(key),
        label: t(`fields.${key}.label`),
        before: String(policy[key]),
        after: String(policyDraft[key]),
      }),
    );
  }, [policy, policyDraft, t]);

  const { mutate: savePolicy, isPending: isSavingPolicy } = usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy({
    onSuccess(data) {
      // Prime from the response and release the pin in the same tick — invalidate-then-release
      // flashes the pre-save value for a frame, and holding the pin past the commit makes the field
      // ignore the server for the lifetime of the mount.
      queryClient.setQueryData(UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn(), data);
      setPolicyDraft({});
      setIsConfirmOpen(false);
      toast.success({ title: t('savedToast.title'), description: t('savedToast.description') });
    },
    onError() {
      toast.error({ title: t('errorToast.title'), description: t('errorToast.description') });
    },
  });

  const { mutate: saveRateLimit, isPending: isSavingRateLimit } = useSettingsServiceUpdateAuthRateLimitSettings({
    onSuccess(data) {
      queryClient.setQueryData(UseSettingsServiceGetAuthRateLimitSettingsKeyFn(), data);
      setRateDraft({});
      toast.success({ title: t('rateLimit.saved.title'), description: t('rateLimit.saved.description') });
    },
    onError() {
      toast.error({ title: t('rateLimit.error.title'), description: t('rateLimit.error.description') });
    },
  });

  const { mutate: saveTwoFactor, isPending: isSavingTwoFactor } = useTwoFactorAuthenticationServiceSetTwoFactorPolicy({
    onSuccess(data) {
      queryClient.setQueryData(UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn(), data);
      setTwoFactorDraft(undefined);
      toast.success({ title: t('twoFactor.saved.title'), description: t('twoFactor.saved.description') });
    },
    onError() {
      toast.error({ title: t('twoFactor.error.title'), description: t('twoFactor.error.description') });
    },
  });
  return {
    t,
    toast,
    queryClient,
    policy,
    isPolicyLoading,
    rateLimit,
    isRateLimitLoading,
    twoFactor,
    savedDomains,
    isDomainsLoading,
    overrides,
    policyDraft,
    setPolicyDraft,
    rateDraft,
    setRateDraft,
    twoFactorDraft,
    setTwoFactorDraft,
    domainsDraft,
    setDomainsDraft,
    domainToAdd,
    setDomainToAdd,
    editingRole,
    setEditingRole,
    isConfirmOpen,
    setIsConfirmOpen,
    overridesByRole,
    policyValue,
    rateValue,
    exponentialBackoff,
    isRateDirty,
    isRateSavable,
    twoFactorValue,
    areDomainsReady,
    domains,
    policyDiff,
    savePolicy,
    isSavingPolicy,
    saveRateLimit,
    isSavingRateLimit,
    saveTwoFactor,
    isSavingTwoFactor,
  } as const;
}
