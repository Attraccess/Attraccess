import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  PasswordPolicyDto,
  UpdatePasswordPolicyDto,
  UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn,
  UseSettingsServiceGetAuthRateLimitSettingsKeyFn,
  UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn,
  UseUsersServiceGetLocalSignupDomainWhitelistKeyFn,
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
  useSettingsServiceGetAuthRateLimitSettings,
  useSettingsServiceUpdateAuthRateLimitSettings,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
  useUsersServiceGetLocalSignupDomainWhitelist,
  useUsersServiceSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../../components/toastProvider';
import { getRateLimitDraft } from '../getRateLimitDraft';
import { POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from '../policy-fields';
import { policyValue } from '../policyValue';
import { SecurityDrafts } from '../useSecurityDrafts';
import { PolicyDiffModal } from './PolicyDiffModal';
import en from '../en.json';
import de from '../de.json';

function domainsHaveChanged(saved: string[] | undefined, draft: string[] | undefined): boolean {
  if (saved === undefined || draft === undefined) return false;
  return draft.length !== saved.length || draft.some((domain, index) => domain !== saved[index]);
}

/**
 * Four backends stand behind this one bar, so Save fires only the mutations whose group is actually
 * dirty. The password policy keeps a confirmation step in front of it — it is the one group here
 * that can make every existing password invalid at once.
 */
export function SecuritySaveBar({ drafts }: { drafts: SecurityDrafts }) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { policyDraft, setPolicyDraft, rateDraft, setRateDraft, twoFactorDraft, domainsDraft } = drafts;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const { data: policy } = usePasswordPolicyAdminServiceGetAdminPasswordPolicy();
  const { data: rateLimit } = useSettingsServiceGetAuthRateLimitSettings();
  const { data: twoFactor } = useTwoFactorAuthenticationServiceGetTwoFactorPolicy();
  const { data: savedDomains } = useUsersServiceGetLocalSignupDomainWhitelist();

  const {
    value: rateValue,
    exponentialBackoff,
    isDirty: isRateDirty,
    isSavable: isRateSavable,
  } = getRateLimitDraft(rateLimit, rateDraft);
  const twoFactorValue = twoFactorDraft ?? twoFactor?.policy;

  const policyDiff = policy
    ? POLICY_FIELD_KEYS.filter((key) => policyDraft[key] !== undefined && policyDraft[key] !== policy[key]).map(
        (key) => ({
          field: String(key),
          label: t(`fields.${key}.label`),
          before: String(policy[key]),
          after: String(policyDraft[key]),
        }),
      )
    : [];

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
      drafts.setTwoFactorDraft(undefined);
      toast.success({ title: t('twoFactor.saved.title'), description: t('twoFactor.saved.description') });
    },
    onError() {
      toast.error({ title: t('twoFactor.error.title'), description: t('twoFactor.error.description') });
    },
  });

  const { mutate: saveDomains, isPending: isSavingDomains } = useUsersServiceSetLocalSignupDomainWhitelist({
    onSuccess() {
      // This endpoint answers with no body, so there is nothing to prime the cache with. Releasing
      // the draft *before* the refetch would flash the old list, so the draft is held until the
      // refetch has landed — hence invalidate first, release after it settles.
      queryClient
        .invalidateQueries({ queryKey: UseUsersServiceGetLocalSignupDomainWhitelistKeyFn() })
        .finally(() => drafts.setDomainsDraft(undefined));
      toast.success({ title: t('domains.saved.title'), description: t('domains.saved.description') });
    },
    onError() {
      toast.error({ title: t('domains.error.title'), description: t('domains.error.description') });
    },
  });

  const isPolicySavable = POLICY_NUMBER_FIELDS.every(({ key }) =>
    Number.isInteger(policyValue(policy, policyDraft, key) as number),
  );
  const isPolicyDirty = policyDiff.length > 0 || (!isPolicySavable && Object.keys(policyDraft).length > 0);
  const isTwoFactorDirty = twoFactorValue !== undefined && twoFactorValue !== twoFactor?.policy;
  const isDomainsDirty = domainsHaveChanged(savedDomains, domainsDraft);

  const isDirty = isRateDirty || isPolicyDirty || isTwoFactorDirty || isDomainsDirty;
  const isSaving = isSavingPolicy || isSavingRateLimit || isSavingTwoFactor || isSavingDomains;

  const commit = () => {
    if (isTwoFactorDirty && twoFactorValue) {
      saveTwoFactor({ requestBody: { policy: twoFactorValue } });
    }
    if (isDomainsDirty && domainsDraft) {
      saveDomains({ requestBody: domainsDraft });
    }
    if (isRateDirty && isRateSavable) {
      saveRateLimit({
        requestBody: {
          maxAttempts: rateValue('maxAttempts'),
          windowSeconds: rateValue('windowSeconds'),
          lockoutDurationSeconds: rateValue('lockoutDurationSeconds'),
          exponentialBackoff,
          backoffMultiplier: rateValue('backoffMultiplier'),
        },
      });
    }
    if (policyDiff.length > 0) {
      // Only the changed keys: PATCH semantics, so an untouched field is never restated and cannot
      // be clobbered by a value this tab loaded before someone else changed it.
      const requestBody: UpdatePasswordPolicyDto = {};
      policyDiff.forEach(({ field }) => {
        (requestBody as Record<string, unknown>)[field] = policyDraft[field as keyof PasswordPolicyDto];
      });
      savePolicy({ requestBody });
    }
  };

  const handleSave = () => {
    if (policyDiff.length > 0) {
      setIsConfirmOpen(true);
      return;
    }
    commit();
  };

  return (
    <>
      {/* Each half of `isSaveDisabled` is scoped to its own group. A bare `!isPolicySavable` was
          unconditionally true whenever the policy query failed — `policyValue` returns undefined and
          `Number.isInteger(undefined)` is false — so an edit to 2FA or the domain whitelist raised
          the bar with Save greyed out and nothing saying why. `isPolicyDirty` is false in that state
          (`policyDraft` is empty, so `policyDiff` is too), and true for a cleared policy field, which
          is the case that must still block. */}
      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={(isRateDirty && !isRateSavable) || (isPolicyDirty && !isPolicySavable)}
        onSave={handleSave}
        onDiscard={drafts.discard}
      />

      <PolicyDiffModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        policyDiff={policyDiff}
        isSaving={isSaving}
        onConfirm={commit}
      />
    </>
  );
}
