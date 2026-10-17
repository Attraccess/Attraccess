import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  Alert,
  AlertContent,
  AlertDescription,
} from '@heroui/react';
import { SettingsRow } from '../../../components/SettingsRow';
import { Button } from '../../../../../components/button/index';
import { POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from '../policy-fields';
import {
  PasswordPolicyDto,
  UpdatePasswordPolicyDto,
  UseUsersServiceGetLocalSignupDomainWhitelistKeyFn,
  useUsersServiceSetLocalSignupDomainWhitelist,
  AuthRateLimitSettingsDto,
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
import { AlertStatusIcon } from '../../../../../components/AlertStatusIcon';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../../../components/toastProvider';
import en from '../en.json';
import de from '../de.json';

export type RateLimitKey = keyof Pick<
  AuthRateLimitSettingsDto,
  'maxAttempts' | 'windowSeconds' | 'lockoutDurationSeconds' | 'backoffMultiplier'
>;

export const OVERRIDE_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

export const RATE_LIMIT_NUMBERS: RateLimitKey[] = ['maxAttempts', 'windowSeconds', 'lockoutDurationSeconds'];

export const TWO_FACTOR_OPTIONS = [
  { value: TwoFactorPolicy.OPTIONAL, key: 'optional' },
  { value: TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED, key: 'privileged' },
  { value: TwoFactorPolicy.REQUIRED_FOR_ALL, key: 'all' },
];

export function domainsHaveChanged(saved: string[] | undefined, draft: string[] | undefined): boolean {
  if (saved === undefined || draft === undefined) return false;
  return draft.length !== saved.length || draft.some((domain, index) => domain !== saved[index]);
}

export function getRateLimitDraft(
  saved: AuthRateLimitSettingsDto | undefined,
  draft: Partial<AuthRateLimitSettingsDto>,
) {
  const rateValue = (key: RateLimitKey): number => draft[key] ?? saved?.[key] ?? NaN;
  const exponentialBackoff = draft.exponentialBackoff ?? saved?.exponentialBackoff ?? false;
  const isRateDirty =
    !!saved &&
    (RATE_LIMIT_NUMBERS.some((key) => !Object.is(rateValue(key), saved[key])) ||
      !Object.is(rateValue('backoffMultiplier'), saved.backoffMultiplier) ||
      exponentialBackoff !== saved.exponentialBackoff);
  // Clearing a NumberField yields NaN. That is still a departure from the saved value, so the bar
  // stays mounted and Discard stays reachable — only Save is blocked.
  //
  // Integer, not merely finite: the three throttling counters and every policy number are `@IsInt()`
  // on the API, and none of these steppers sets a `step`, so `2.5` is typeable. `Number.isFinite`
  // let it through to a 400 rendered as a generic toast that names no field.
  // `backoffMultiplier` is the one genuine `@IsNumber()`, so it only has to be finite and >= 1.
  const isRateSavable =
    RATE_LIMIT_NUMBERS.every((key) => Number.isInteger(rateValue(key)) && rateValue(key) >= 1) &&
    Number.isFinite(rateValue('backoffMultiplier')) &&
    rateValue('backoffMultiplier') >= 1;
  return { value: rateValue, exponentialBackoff, isDirty: isRateDirty, isSavable: isRateSavable };
}

export /**
 * A break between groups of rows. Four concerns share one section, and without a marker the
 * password-policy switches read as more login-throttling switches — the grouping is the only thing
 * that says which backend a row belongs to.
 */
function SubHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted">{description}</p>
    </div>
  );
}

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

export function useSecuritySectionState() {
  const useSecuritySectionStateInputsModel = useSecuritySectionStateInputs();
  return useSecuritySectionStateOutput(useSecuritySectionStateInputsModel);
}

type Props = Pick<ReturnType<typeof useSecuritySectionState>, 't' | 'overridesByRole' | 'setEditingRole'>;

export function SecuritySettingsForm({ t, overridesByRole, setEditingRole }: Props) {
  return (
    <SettingsRow stacked label={t('overrides.title')} hint={t('overrides.subtitle')}>
      <Table data-testid="policy-overrides-table">
        <TableScrollContainer>
          <TableContent aria-label={t('overrides.title')}>
            <TableHeader>
              <TableColumn isRowHeader>{t('overrides.role')}</TableColumn>
              <TableColumn>{t('overrides.status')}</TableColumn>
              <TableColumn width="0" className="text-right">
                {t('overrides.actions')}
              </TableColumn>
            </TableHeader>
            <TableBody>
              {OVERRIDE_ROLES.map((role) => {
                const row = overridesByRole.get(role);
                const count = row ? POLICY_FIELD_KEYS.filter((key) => row[key as keyof typeof row] !== null).length : 0;
                return (
                  <TableRow key={role} id={role} data-testid={`policy-override-row-${role}`}>
                    <TableCell>{t(`overrides.roles.${role}`)}</TableCell>
                    <TableCell>
                      {count === 0 ? (
                        <Chip variant="soft">{t('overrides.statusInherits')}</Chip>
                      ) : (
                        <Chip color="warning" variant="soft">
                          {t('overrides.statusCustom', { count })}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => setEditingRole(role)}
                          data-testid={`policy-override-edit-${role}`}
                        >
                          {t('overrides.edit')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </TableContent>
        </TableScrollContainer>
      </Table>
    </SettingsRow>
  );
}
