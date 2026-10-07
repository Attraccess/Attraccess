import {
  PasswordPolicyDto,
  UpdatePasswordPolicyDto,
  UseUsersServiceGetLocalSignupDomainWhitelistKeyFn,
  useUsersServiceSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { POLICY_NUMBER_FIELDS } from './policy-fields';
import { domainsHaveChanged } from './index.helpers';
import { Alert, AlertContent, AlertDescription } from '@heroui/react';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import type { useSecuritySectionStateInputs } from './useSecuritySectionStateInputs';

export function useSecuritySectionStateOutput(model: ReturnType<typeof useSecuritySectionStateInputs>) {
  const { mutate: saveDomains, isPending: isSavingDomains } = useUsersServiceSetLocalSignupDomainWhitelist({
    onSuccess() {
      // This endpoint answers with no body, so there is nothing to prime the cache with. Releasing
      // the draft *before* the refetch would flash the old list, so the draft is held until the
      // refetch has landed — hence invalidate first, release after it settles.
      model.queryClient
        .invalidateQueries({ queryKey: UseUsersServiceGetLocalSignupDomainWhitelistKeyFn() })
        .finally(() => model.setDomainsDraft(undefined));
      model.toast.success({ title: model.t('domains.saved.title'), description: model.t('domains.saved.description') });
    },
    onError() {
      model.toast.error({ title: model.t('domains.error.title'), description: model.t('domains.error.description') });
    },
  });

  const isPolicySavable = POLICY_NUMBER_FIELDS.every(({ key }) => Number.isInteger(model.policyValue(key) as number));

  const isPolicyDirty = model.policyDiff.length > 0 || (!isPolicySavable && Object.keys(model.policyDraft).length > 0);
  const isTwoFactorDirty = model.twoFactorValue !== undefined && model.twoFactorValue !== model.twoFactor?.policy;

  const loadFailed = (message: string) => (
    <Alert status="danger">
      <AlertStatusIcon status="danger" />
      <AlertContent>
        <AlertDescription>{message}</AlertDescription>
      </AlertContent>
    </Alert>
  );
  const isDomainsDirty = domainsHaveChanged(model.savedDomains, model.domainsDraft);

  const isDirty = model.isRateDirty || isPolicyDirty || isTwoFactorDirty || isDomainsDirty;
  const isSaving = model.isSavingPolicy || model.isSavingRateLimit || model.isSavingTwoFactor || isSavingDomains;

  const commit = () => {
    if (isTwoFactorDirty && model.twoFactorValue) {
      model.saveTwoFactor({ requestBody: { policy: model.twoFactorValue } });
    }
    if (isDomainsDirty && model.domainsDraft) {
      saveDomains({ requestBody: model.domainsDraft });
    }
    if (model.isRateDirty && model.isRateSavable) {
      model.saveRateLimit({
        requestBody: {
          maxAttempts: model.rateValue('maxAttempts'),
          windowSeconds: model.rateValue('windowSeconds'),
          lockoutDurationSeconds: model.rateValue('lockoutDurationSeconds'),
          exponentialBackoff: model.exponentialBackoff,
          backoffMultiplier: model.rateValue('backoffMultiplier'),
        },
      });
    }
    if (model.policyDiff.length > 0) {
      // Only the changed keys: PATCH semantics, so an untouched field is never restated and cannot
      // be clobbered by a value this tab loaded before someone else changed it.
      const requestBody: UpdatePasswordPolicyDto = {};
      model.policyDiff.forEach(({ field }) => {
        (requestBody as Record<string, unknown>)[field] = model.policyDraft[field as keyof PasswordPolicyDto];
      });
      model.savePolicy({ requestBody });
    }
  };

  const handleSave = () => {
    if (model.policyDiff.length > 0) {
      model.setIsConfirmOpen(true);
      return;
    }
    commit();
  };

  const discard = () => {
    model.setPolicyDraft({});
    model.setRateDraft({});
    model.setTwoFactorDraft(undefined);
    model.setDomainsDraft(undefined);
    model.setDomainToAdd('');
  };

  const addDomain = () => {
    // Guarded as well as disabled: Enter reaches this without going through the button.
    if (!model.areDomainsReady) {
      return;
    }
    const value = model.domainToAdd.trim().toLowerCase();
    if (!value || model.domains.includes(value)) {
      model.setDomainToAdd('');
      return;
    }
    model.setDomainsDraft([...model.domains, value]);
    model.setDomainToAdd('');
  };
  return {
    t: model.t,
    policy: model.policy,
    isPolicyLoading: model.isPolicyLoading,
    rateLimit: model.rateLimit,
    isRateLimitLoading: model.isRateLimitLoading,
    isDomainsLoading: model.isDomainsLoading,
    policyDraft: model.policyDraft,
    setPolicyDraft: model.setPolicyDraft,
    setRateDraft: model.setRateDraft,
    setTwoFactorDraft: model.setTwoFactorDraft,
    setDomainsDraft: model.setDomainsDraft,
    domainToAdd: model.domainToAdd,
    setDomainToAdd: model.setDomainToAdd,
    editingRole: model.editingRole,
    setEditingRole: model.setEditingRole,
    isConfirmOpen: model.isConfirmOpen,
    setIsConfirmOpen: model.setIsConfirmOpen,
    overridesByRole: model.overridesByRole,
    policyValue: model.policyValue,
    rateValue: model.rateValue,
    exponentialBackoff: model.exponentialBackoff,
    isRateDirty: model.isRateDirty,
    isRateSavable: model.isRateSavable,
    twoFactorValue: model.twoFactorValue,
    areDomainsReady: model.areDomainsReady,
    domains: model.domains,
    policyDiff: model.policyDiff,
    isPolicySavable,
    isPolicyDirty,
    isDirty,
    isSaving,
    commit,
    handleSave,
    discard,
    addDomain,
    loadFailed,
  } as const;
}
