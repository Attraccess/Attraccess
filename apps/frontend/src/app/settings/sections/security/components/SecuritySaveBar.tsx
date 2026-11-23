import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuthRateLimitSettingsDto,
  PasswordPolicyDto,
  TwoFactorPolicy,
  UpdatePasswordPolicyDto,
  UseGetAdminPasswordPolicyKeyFn,
  UseGetAuthRateLimitSettingsKeyFn,
  UseGetTwoFactorPolicyKeyFn,
  UseGetLocalSignupDomainWhitelistKeyFn,
  useUpdateAdminPasswordPolicy,
  useUpdateAuthRateLimitSettings,
  useSetTwoFactorPolicy,
  useSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { SettingsSaveBar } from '../../../components/SettingsSaveBar';
import { useToastMessage } from '../../../../../components/toastProvider';
import { getRateLimitDraft } from '../getRateLimitDraft';
import { POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from '../policy-fields';
import { policyValue } from '../policyValue';
import { SecurityDrafts } from '../useSecurityDrafts';
import { NetworkRestrictionDrafts } from '../useNetworkRestrictionDrafts';
import { PolicyDiffModal } from './PolicyDiffModal';
import en from '../en.json';
import de from '../de.json';

function domainsHaveChanged(saved: string[] | undefined, draft: string[] | undefined): boolean {
  if (saved === undefined || draft === undefined) return false;
  return draft.length !== saved.length || draft.some((domain, index) => domain !== saved[index]);
}

/** The stored values of the four policy groups (the network restriction loads its own), loaded by the section; each is `undefined` until (or unless) it arrives. */
interface SecuritySaveBarProps {
  drafts: SecurityDrafts;
  /** The network restriction card's edits; that group loads, saves and reports its own result. */
  network: NetworkRestrictionDrafts;
  policy: PasswordPolicyDto | undefined;
  rateLimit: AuthRateLimitSettingsDto | undefined;
  twoFactorPolicy: TwoFactorPolicy | undefined;
  savedDomains: string[] | undefined;
}

/**
 * Five backends stand behind this one bar, so Save fires only the mutations whose group is actually
 * dirty. The password policy keeps a confirmation step in front of it — it is the one group here
 * that can make every existing password invalid at once.
 */
export function SecuritySaveBar({
  drafts,
  network,
  policy,
  rateLimit,
  twoFactorPolicy,
  savedDomains,
}: SecuritySaveBarProps) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { policyDraft, setPolicyDraft, rateDraft, setRateDraft, twoFactorDraft, domainsDraft } = drafts;
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const {
    value: rateValue,
    exponentialBackoff,
    isDirty: isRateDirty,
    isSavable: isRateSavable,
  } = getRateLimitDraft(rateLimit, rateDraft);
  const twoFactorValue = twoFactorDraft ?? twoFactorPolicy;

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

  const { mutate: savePolicy, isPending: isSavingPolicy } = useUpdateAdminPasswordPolicy(undefined, {
    onSuccess(data) {
      // Prime from the response and release the pin in the same tick — invalidate-then-release
      // flashes the pre-save value for a frame, and holding the pin past the commit makes the field
      // ignore the server for the lifetime of the mount.
      queryClient.setQueryData(UseGetAdminPasswordPolicyKeyFn(), data);
      setPolicyDraft({});
      setIsConfirmOpen(false);
      toast.success({ title: t('savedToast.title'), description: t('savedToast.description') });
    },
    onError() {
      toast.error({ title: t('errorToast.title'), description: t('errorToast.description') });
    },
  });

  const { mutate: saveRateLimit, isPending: isSavingRateLimit } = useUpdateAuthRateLimitSettings(undefined, {
    onSuccess(data) {
      queryClient.setQueryData(UseGetAuthRateLimitSettingsKeyFn(), data);
      setRateDraft({});
      toast.success({ title: t('rateLimit.saved.title'), description: t('rateLimit.saved.description') });
    },
    onError() {
      toast.error({ title: t('rateLimit.error.title'), description: t('rateLimit.error.description') });
    },
  });

  const { mutate: saveTwoFactor, isPending: isSavingTwoFactor } = useSetTwoFactorPolicy(undefined, {
    onSuccess(data) {
      queryClient.setQueryData(UseGetTwoFactorPolicyKeyFn(), data);
      drafts.setTwoFactorDraft(undefined);
      toast.success({ title: t('twoFactor.saved.title'), description: t('twoFactor.saved.description') });
    },
    onError() {
      toast.error({ title: t('twoFactor.error.title'), description: t('twoFactor.error.description') });
    },
  });

  const { mutate: saveDomains, isPending: isSavingDomains } = useSetLocalSignupDomainWhitelist(undefined, {
    onSuccess() {
      // This endpoint answers with no body, so there is nothing to prime the cache with. Releasing
      // the draft *before* the refetch would flash the old list, so the draft is held until the
      // refetch has landed — hence invalidate first, release after it settles.
      queryClient
        .invalidateQueries({ queryKey: UseGetLocalSignupDomainWhitelistKeyFn() })
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
  const isTwoFactorDirty = twoFactorValue !== undefined && twoFactorValue !== twoFactorPolicy;
  const isDomainsDirty = domainsHaveChanged(savedDomains, domainsDraft);

  const isDirty = isRateDirty || isPolicyDirty || isTwoFactorDirty || isDomainsDirty || network.isDirty;
  const isSaving = isSavingPolicy || isSavingRateLimit || isSavingTwoFactor || isSavingDomains || network.isSaving;

  const commit = () => {
    if (network.isDirty) {
      void network.save();
    }
    if (isTwoFactorDirty && twoFactorValue) {
      saveTwoFactor({ body: { policy: twoFactorValue } });
    }
    if (isDomainsDirty && domainsDraft) {
      saveDomains({ body: domainsDraft });
    }
    if (isRateDirty && isRateSavable) {
      saveRateLimit({
        body: {
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
      savePolicy({ body: requestBody });
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
        isSaveDisabled={
          (isRateDirty && !isRateSavable) ||
          (isPolicyDirty && !isPolicySavable) ||
          (network.isDirty && network.isSaveDisabled)
        }
        onSave={handleSave}
        onDiscard={() => {
          drafts.discard();
          network.discard();
        }}
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
