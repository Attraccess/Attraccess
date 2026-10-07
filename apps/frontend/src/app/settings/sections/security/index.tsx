import {
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
  Spinner,
} from '@heroui/react';
import { SettingsSection } from '../../components/SettingsSection';
import { SettingsRow } from '../../components/SettingsRow';
import { SettingsSaveBar } from '../../components/SettingsSaveBar';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { PasswordPreview } from './PasswordPreview';
import { RoleOverridesModal } from './RoleOverridesModal';
import { POLICY_BOOL_FIELDS, POLICY_NUMBER_FIELDS } from './policy-fields';
import { SubHeading } from './index.helpers';
import { useSecuritySectionState } from './useSecuritySectionState';
import { SecuritySectionSettingsRow } from './SecuritySectionSettingsRow';
import { SecuritySectionStandardModal } from './SecuritySectionStandardModal';
import { SecuritySectionTwoFactorLabel } from './SecuritySectionTwoFactorLabel';
import { SecuritySectionRateLimitLoadFailed } from './SecuritySectionRateLimitLoadFailed';

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
  const model = useSecuritySectionState();

  // Loading only. Folding `!policy || !rateLimit` in here conflated "not arrived yet" with "arrived
  // empty": on error `isLoading` goes false while the data stays undefined, so the spinner became
  // permanent — and it took 2FA, the domain whitelist and the overrides down with it, none of which
  // come from these two queries. Same distinction `areDomainsReady` and `areLimitsReady` draw.
  if (model.isPolicyLoading || model.isRateLimitLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner />
        {model.t('loading')}
      </div>
    );
  }
  // Everything the operator needs while editing is on the left; the aside is the one thing that is
  // purely reference — a live, server-evaluated read on the policy being written. Without a policy
  // there is nothing to preview against.
  const aside = model.policy ? (
    <PasswordPreview policy={{ ...model.policy, ...model.policyDraft }} t={model.t} />
  ) : undefined;

  return (
    <SettingsSection title={model.t('title')} description={model.t('description')} aside={aside}>
      <SubHeading title={model.t('access.heading')} description={model.t('access.description')} />

      <SecuritySectionTwoFactorLabel {...model} />

      <SubHeading title={model.t('rateLimit.heading')} description={model.t('rateLimit.description')} />

      <SecuritySectionRateLimitLoadFailed {...model} />

      <SubHeading title={model.t('policy.heading')} description={model.t('policy.description')} />

      <div className="flex flex-col">
        {!model.policy ? (
          <div data-testid="policy-load-failed">{model.loadFailed(model.t('policy.loadFailed'))}</div>
        ) : (
          <>
            {POLICY_NUMBER_FIELDS.map(({ key, min, max }) => (
              <SettingsRow
                key={String(key)}
                data-testid={`policy-row-${String(key)}`}
                label={model.t(`fields.${key}.label`)}
                hint={model.t(`fields.${key}.description`)}
              >
                <NumberField
                  aria-label={model.t(`fields.${key}.label`)}
                  value={model.policyValue(key) as number}
                  minValue={min}
                  maxValue={max}
                  onChange={(next) => model.setPolicyDraft((current) => ({ ...current, [key]: next }))}
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
                label={model.t(`fields.${key}.label`)}
                hint={model.t(`fields.${key}.description`)}
              >
                <LabeledSwitch
                  aria-label={model.t(`fields.${key}.label`)}
                  isSelected={model.policyValue(key) as boolean}
                  onChange={(next) => model.setPolicyDraft((current) => ({ ...current, [key]: next }))}
                />
              </SettingsRow>
            ))}

            <SecuritySectionSettingsRow {...model} />
          </>
        )}
      </div>

      {/* Each half of `isSaveDisabled` is scoped to its own group. A bare `!isPolicySavable` was
          unconditionally true whenever the policy query failed — `policyValue` returns undefined and
          `Number.isInteger(undefined)` is false — so an edit to 2FA or the domain whitelist raised
          the bar with Save greyed out and nothing saying why. `isPolicyDirty` is false in that state
          (`policyDraft` is empty, so `policyDiff` is too), and true for a cleared policy field, which
          is the case that must still block. */}
      <SettingsSaveBar
        isDirty={model.isDirty}
        isSaving={model.isSaving}
        isSaveDisabled={(model.isRateDirty && !model.isRateSavable) || (model.isPolicyDirty && !model.isPolicySavable)}
        onSave={model.handleSave}
        onDiscard={model.discard}
      />

      {/* `policy`, not `{ ...policy, ...policyDraft }`. The modal commits on its own, and inheritance
          resolves server-side against what is *stored* — so seeding an override from an unsaved edit
          would pin it to a value that never existed on the instance (and could then be Discarded),
          while the "inherit: N" hint would name a number no role would actually get. */}
      {model.policy && (
        <RoleOverridesModal
          role={model.editingRole}
          existing={model.editingRole ? model.overridesByRole.get(model.editingRole) : undefined}
          globalPolicy={model.policy}
          t={model.t}
          onClose={() => model.setEditingRole(null)}
        />
      )}

      <SecuritySectionStandardModal {...model} />
    </SettingsSection>
  );
}

export default SecuritySection;
