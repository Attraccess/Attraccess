import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Chip,
  Input,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
} from '@heroui/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import {
  AuthRateLimitSettingsDto,
  PasswordPolicyDto,
  PasswordPolicyRole,
  TwoFactorPolicy,
  UpdatePasswordPolicyDto,
  UsePasswordPolicyAdminServiceGetAdminPasswordPolicyKeyFn,
  UseSettingsServiceGetAuthRateLimitSettingsKeyFn,
  UseTwoFactorAuthenticationServiceGetTwoFactorPolicyKeyFn,
  UseUsersServiceGetLocalSignupDomainWhitelistKeyFn,
  usePasswordPolicyAdminServiceGetAdminPasswordPolicy,
  usePasswordPolicyAdminServiceListPasswordPolicyOverrides,
  usePasswordPolicyAdminServiceUpdateAdminPasswordPolicy,
  useSettingsServiceGetAuthRateLimitSettings,
  useSettingsServiceUpdateAuthRateLimitSettings,
  useTwoFactorAuthenticationServiceGetTwoFactorPolicy,
  useTwoFactorAuthenticationServiceSetTwoFactorPolicy,
  useUsersServiceGetLocalSignupDomainWhitelist,
  useUsersServiceSetLocalSignupDomainWhitelist,
} from '@attraccess/react-query-client';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { Button } from '../../../../components/button';
import { Select } from '../../../../components/select';
import { StandardModal } from '../../../../components/standardModal';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { AlertStatusIcon } from '../../../../components/AlertStatusIcon';
import { useToastMessage } from '../../../../components/toastProvider';
import { PasswordPreview } from './PasswordPreview';
import { RoleOverridesModal } from './RoleOverridesModal';
import { POLICY_BOOL_FIELDS, POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from './policy-fields';
import en from './en.json';
import de from './de.json';

type RateLimitKey = keyof Pick<
  AuthRateLimitSettingsDto,
  'maxAttempts' | 'windowSeconds' | 'lockoutDurationSeconds' | 'backoffMultiplier'
>;

const RATE_LIMIT_NUMBERS: RateLimitKey[] = ['maxAttempts', 'windowSeconds', 'lockoutDurationSeconds'];

const OVERRIDE_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

/**
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

const TWO_FACTOR_OPTIONS = [
  { value: TwoFactorPolicy.OPTIONAL, key: 'optional' },
  { value: TwoFactorPolicy.REQUIRED_FOR_PRIVILEGED, key: 'privileged' },
  { value: TwoFactorPolicy.REQUIRED_FOR_ALL, key: 'all' },
];

/**
 * Everything that decides who gets in and on what terms: sign-in throttling, the password policy,
 * the two-factor requirement and which domains may self-register.
 *
 * These were four separate destinations — an inline form on `/users/security`, a whole page at
 * `/users/security/password-policy`, and two header modals — reached four different ways, none of
 * which told an operator that they interact. One section, one save bar.
 *
 * Four backends stand behind that one bar, so Save fires only the mutations whose group is actually
 * dirty. The password policy keeps a confirmation step in front of it — it is the one group here
 * that can make every existing password invalid at once, and a diff of exactly what is changing is
 * cheaper to read than the form.
 */
export function SecuritySection() {
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
  const rateValue = (key: RateLimitKey): number => rateDraft[key] ?? rateLimit?.[key] ?? NaN;
  const exponentialBackoff = rateDraft.exponentialBackoff ?? rateLimit?.exponentialBackoff ?? false;
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

  const { mutate: saveDomains, isPending: isSavingDomains } = useUsersServiceSetLocalSignupDomainWhitelist({
    onSuccess() {
      // This endpoint answers with no body, so there is nothing to prime the cache with. Releasing
      // the draft *before* the refetch would flash the old list, so the draft is held until the
      // refetch has landed — hence invalidate first, release after it settles.
      queryClient
        .invalidateQueries({ queryKey: UseUsersServiceGetLocalSignupDomainWhitelistKeyFn() })
        .finally(() => setDomainsDraft(undefined));
      toast.success({ title: t('domains.saved.title'), description: t('domains.saved.description') });
    },
    onError() {
      toast.error({ title: t('domains.error.title'), description: t('domains.error.description') });
    },
  });

  const isRateDirty =
    !!rateLimit &&
    (RATE_LIMIT_NUMBERS.some((key) => !Object.is(rateValue(key), rateLimit[key])) ||
      !Object.is(rateValue('backoffMultiplier'), rateLimit.backoffMultiplier) ||
      exponentialBackoff !== rateLimit.exponentialBackoff);
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
  const isPolicySavable = POLICY_NUMBER_FIELDS.every(({ key }) => Number.isInteger(policyValue(key) as number));

  const isPolicyDirty = policyDiff.length > 0 || (!isPolicySavable && Object.keys(policyDraft).length > 0);
  const isTwoFactorDirty = twoFactorValue !== undefined && twoFactorValue !== twoFactor?.policy;
  const isDomainsDirty =
    areDomainsReady &&
    domainsDraft !== undefined &&
    (domainsDraft.length !== savedDomains.length ||
      domainsDraft.some((domain, index) => domain !== savedDomains[index]));

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

  const discard = () => {
    setPolicyDraft({});
    setRateDraft({});
    setTwoFactorDraft(undefined);
    setDomainsDraft(undefined);
    setDomainToAdd('');
  };

  const addDomain = () => {
    // Guarded as well as disabled: Enter reaches this without going through the button.
    if (!areDomainsReady) {
      return;
    }
    const value = domainToAdd.trim().toLowerCase();
    if (!value || domains.includes(value)) {
      setDomainToAdd('');
      return;
    }
    setDomainsDraft([...domains, value]);
    setDomainToAdd('');
  };

  if (isPolicyLoading || isRateLimitLoading || !policy || !rateLimit) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {t('loading')}
      </div>
    );
  }

  // Everything the operator needs while editing is on the left; the aside is the one thing that is
  // purely reference — a live, server-evaluated read on the policy being written.
  const aside = <PasswordPreview policy={{ ...policy, ...policyDraft }} t={t} />;

  return (
    <SettingsSection title={t('title')} description={t('description')} aside={aside}>
      <SubHeading title={t('access.heading')} description={t('access.description')} />

      <div className="flex flex-col">
        <SettingsRow stacked label={t('twoFactor.label')} hint={t('twoFactor.hint')}>
          <div className="flex w-full flex-col gap-2">
            <Select
              aria-label={t('twoFactor.label')}
              value={twoFactorValue}
              onChange={(key) => setTwoFactorDraft(key as TwoFactorPolicy)}
              items={TWO_FACTOR_OPTIONS.map(({ value, key }) => ({
                key: value,
                textValue: t(`twoFactor.options.${key}.label`),
                label: (
                  <div className="flex flex-col gap-1">
                    <span>{t(`twoFactor.options.${key}.label`)}</span>
                    <span className="text-xs text-muted">{t(`twoFactor.options.${key}.description`)}</span>
                  </div>
                ),
              }))}
            />
            {/* `!== OPTIONAL` alone is true while the query is still undefined, which flashed the
                warning for a frame on instances that have 2FA optional. */}
            {twoFactorValue !== undefined && twoFactorValue !== TwoFactorPolicy.OPTIONAL && (
              <Alert status="warning">
                <AlertStatusIcon status="warning" />
                <AlertContent>
                  <AlertDescription>{t('twoFactor.warning')}</AlertDescription>
                </AlertContent>
              </Alert>
            )}
          </div>
        </SettingsRow>

        <SettingsRow stacked label={t('domains.label')} hint={t('domains.hint')} data-testid="signup-domains-row">
          {isDomainsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" />
              {t('domains.loading')}
            </div>
          ) : !areDomainsReady ? (
            // The list is unknown, not empty. Editing from here would stage a change against a
            // fallback that is not the instance's state, and Save is a full replace.
            <Alert status="danger">
              <AlertStatusIcon status="danger" />
              <AlertContent>
                <AlertDescription>{t('domains.loadFailed')}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {/* Wraps rather than clipping: on a tablet the content column is narrow enough that the
                  button would otherwise be pushed past its right edge. */}
              <div className="flex flex-wrap items-end gap-2">
                <TextField
                  className="min-w-[12rem] flex-1"
                  value={domainToAdd}
                  onChange={setDomainToAdd}
                  aria-label={t('domains.addLabel')}
                  data-testid="signup-domain-input"
                >
                  <Input
                    placeholder={t('domains.addPlaceholder')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        // There is no <form> here, but the browser still treats Enter in a lone text
                        // input as a submit attempt — which would reload the page.
                        event.preventDefault();
                        addDomain();
                      }
                    }}
                  />
                </TextField>
                <Button variant="secondary" size="sm" onPress={addDomain} isDisabled={!domainToAdd.trim()}>
                  <PlusIcon size={16} />
                  {t('domains.addButton')}
                </Button>
              </div>

              {domains.length === 0 ? (
                <p className="text-xs text-muted">{t('domains.empty')}</p>
              ) : (
                <ul className="flex flex-col">
                  {domains.map((domain) => (
                    <li
                      key={domain}
                      data-testid={`signup-domain-${domain}`}
                      className="flex items-center justify-between gap-2 border-b border-separator py-1.5 last:border-b-0"
                    >
                      <span className="truncate font-mono text-sm text-foreground">{domain}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        isIconOnly
                        aria-label={t('domains.remove', { domain })}
                        onPress={() => setDomainsDraft(domains.filter((entry) => entry !== domain))}
                      >
                        <Trash2Icon size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </SettingsRow>

      </div>

      <SubHeading title={t('rateLimit.heading')} description={t('rateLimit.description')} />

      <div className="flex flex-col">
        {RATE_LIMIT_NUMBERS.map((key) => (
          <SettingsRow
            key={key}
            label={t(`rateLimit.fields.${key}.label`)}
            hint={t(`rateLimit.fields.${key}.description`)}
          >
            <NumberField
              aria-label={t(`rateLimit.fields.${key}.label`)}
              value={rateValue(key)}
              minValue={1}
              onChange={(next) => setRateDraft((current) => ({ ...current, [key]: next }))}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
          </SettingsRow>
        ))}

        <SettingsRow
          label={t('rateLimit.fields.exponentialBackoff.label')}
          hint={t('rateLimit.fields.exponentialBackoff.description')}
        >
          <LabeledSwitch
            aria-label={t('rateLimit.fields.exponentialBackoff.label')}
            isSelected={exponentialBackoff}
            onChange={(next) => setRateDraft((current) => ({ ...current, exponentialBackoff: next }))}
          />
        </SettingsRow>

        <SettingsRow
          label={t('rateLimit.fields.backoffMultiplier.label')}
          hint={t('rateLimit.fields.backoffMultiplier.description')}
        >
          <NumberField
            aria-label={t('rateLimit.fields.backoffMultiplier.label')}
            value={rateValue('backoffMultiplier')}
            minValue={1}
            step={0.1}
            isDisabled={!exponentialBackoff}
            onChange={(next) => setRateDraft((current) => ({ ...current, backoffMultiplier: next }))}
          >
            <NumberFieldGroup>
              <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
              <NumberFieldInput />
              <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
            </NumberFieldGroup>
          </NumberField>
        </SettingsRow>

      </div>

      <SubHeading title={t('policy.heading')} description={t('policy.description')} />

      <div className="flex flex-col">
        {POLICY_NUMBER_FIELDS.map(({ key, min, max }) => (
          <SettingsRow
            key={String(key)}
            data-testid={`policy-row-${String(key)}`}
            label={t(`fields.${key}.label`)}
            hint={t(`fields.${key}.description`)}
          >
            <NumberField
              aria-label={t(`fields.${key}.label`)}
              value={policyValue(key) as number}
              minValue={min}
              maxValue={max}
              onChange={(next) => setPolicyDraft((current) => ({ ...current, [key]: next }))}
            >
              <NumberFieldGroup>
                <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                <NumberFieldInput />
                <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
              </NumberFieldGroup>
            </NumberField>
          </SettingsRow>
        ))}

        {POLICY_BOOL_FIELDS.map((key) => (
          <SettingsRow
            key={String(key)}
            data-testid={`policy-row-${String(key)}`}
            label={t(`fields.${key}.label`)}
            hint={t(`fields.${key}.description`)}
          >
            <LabeledSwitch
              aria-label={t(`fields.${key}.label`)}
              isSelected={policyValue(key) as boolean}
              onChange={(next) => setPolicyDraft((current) => ({ ...current, [key]: next }))}
            />
          </SettingsRow>
        ))}

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
                    const count = row
                      ? POLICY_FIELD_KEYS.filter((key) => row[key as keyof typeof row] !== null).length
                      : 0;
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
      </div>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        isSaveDisabled={(isRateDirty && !isRateSavable) || !isPolicySavable}
        onSave={handleSave}
        onDiscard={discard}
      />

      {/* `policy`, not `{ ...policy, ...policyDraft }`. The modal commits on its own, and inheritance
          resolves server-side against what is *stored* — so seeding an override from an unsaved edit
          would pin it to a value that never existed on the instance (and could then be Discarded),
          while the "inherit: N" hint would name a number no role would actually get. */}
      <RoleOverridesModal
        role={editingRole}
        existing={editingRole ? overridesByRole.get(editingRole) : undefined}
        globalPolicy={policy}
        t={t}
        onClose={() => setEditingRole(null)}
      />

      <StandardModal isOpen={isConfirmOpen} onOpenChange={(open) => !open && setIsConfirmOpen(false)} size="lg">
        {({ close }) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <ModalHeading>{t('diff.title')}</ModalHeading>
              <span className="text-sm font-normal text-muted">{t('diff.subtitle')}</span>
            </ModalHeader>
            <ModalBody>
              <Table data-testid="policy-diff-table">
                <TableScrollContainer>
                  <TableContent aria-label={t('diff.title')}>
                    <TableHeader>
                      <TableColumn isRowHeader>{t('diff.field')}</TableColumn>
                      <TableColumn>{t('diff.before')}</TableColumn>
                      <TableColumn>{t('diff.after')}</TableColumn>
                    </TableHeader>
                    <TableBody>
                      {policyDiff.map((row) => (
                        <TableRow key={row.field} id={row.field}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell>
                            <code className="text-muted">{row.before}</code>
                          </TableCell>
                          <TableCell>
                            <code className="text-foreground">{row.after}</code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </TableContent>
                </TableScrollContainer>
              </Table>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={close} isDisabled={isSaving}>
                {t('diff.cancel')}
              </Button>
              <Button variant="primary" onPress={commit} isPending={isSaving} data-testid="policy-diff-confirm">
                {t('diff.confirm')}
              </Button>
            </ModalFooter>
          </>
        )}
      </StandardModal>
    </SettingsSection>
  );
}

export default SecuritySection;
