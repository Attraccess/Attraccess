import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  NumberField,
  NumberFieldDecrementButton,
  NumberFieldGroup,
  NumberFieldIncrementButton,
  NumberFieldInput,
} from '@heroui/react';
import { PasswordPolicyDto } from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { POLICY_BOOL_FIELDS, POLICY_NUMBER_FIELDS } from './policy-fields';
import { OverrideKey } from './RoleOverridesModal.contracts';
import { Props } from './RoleOverridesModal.contracts';
import { useRoleOverridesModalState } from './useRoleOverridesModalState';

/**
 * Per-role password overrides, kept as a modal rather than inlined into the section.
 *
 * An override is a *sparse* delta: twelve fields that are each either inherited or overridden, so
 * inlining it means twenty-four controls that are empty on a default instance, sitting permanently
 * above the fold of the section they are an exception to. The row in the section carries the state
 * that matters — inherits, or N fields overridden — and the editor opens on demand.
 *
 * It also targets a different resource (one role's override, not the instance's settings), so it
 * commits on its own rather than through the section's save bar.
 */
export function RoleOverridesModal({ role, existing, globalPolicy, t, onClose }: Props) {
  const { valueOf, setValue, isSavable, isSaving, handleSave } = useRoleOverridesModalState({
    role,
    existing,
    globalPolicy,
    t,
    onClose,
  });

  return (
    <StandardModal isOpen={role !== null} onOpenChange={(open) => !open && onClose()} size="lg">
      <ModalHeader className="flex flex-col gap-1">
        <ModalHeading>{t('overrides.modal.title', { role: role ? t(`overrides.roles.${role}`) : '' })}</ModalHeading>
        <span className="text-sm font-normal text-muted">{t('overrides.modal.subtitle')}</span>
      </ModalHeader>
      <ModalBody>
        <div className="flex flex-col">
          {POLICY_NUMBER_FIELDS.map(({ key, min, max }) => {
            const value = valueOf(key as OverrideKey) as number | null;
            const fallback = globalPolicy[key as keyof PasswordPolicyDto] as number;
            return (
              <SettingsRow
                key={String(key)}
                stacked
                label={t(`fields.${key}.label`)}
                hint={t(`fields.${key}.description`)}
              >
                <div className="flex w-full flex-col gap-2">
                  <LabeledSwitch
                    isSelected={value !== null}
                    onChange={(on) => setValue(key as OverrideKey, on ? fallback : null)}
                    data-testid={`override-${role}-${String(key)}-toggle`}
                  >
                    <span className="text-sm">{value !== null ? t('overrides.override') : t('overrides.inherit')}</span>
                  </LabeledSwitch>
                  {value !== null ? (
                    <NumberField
                      aria-label={t(`fields.${key}.label`)}
                      value={value}
                      minValue={min}
                      maxValue={max}
                      onChange={(next) => setValue(key as OverrideKey, next)}
                    >
                      <NumberFieldGroup>
                        <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                        <NumberFieldInput data-testid={`override-${role}-${String(key)}-value`} />
                        <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                      </NumberFieldGroup>
                    </NumberField>
                  ) : (
                    <span className="text-xs text-muted">
                      ↳ {t('overrides.inherit')}: {fallback}
                    </span>
                  )}
                </div>
              </SettingsRow>
            );
          })}

          {POLICY_BOOL_FIELDS.map((key) => {
            const value = valueOf(key as OverrideKey) as boolean | null;
            const fallback = globalPolicy[key as keyof PasswordPolicyDto] as boolean;
            return (
              <SettingsRow
                key={String(key)}
                stacked
                label={t(`fields.${key}.label`)}
                hint={t(`fields.${key}.description`)}
              >
                <div className="flex w-full flex-col gap-2">
                  <LabeledSwitch
                    isSelected={value !== null}
                    onChange={(on) => setValue(key as OverrideKey, on ? fallback : null)}
                    data-testid={`override-${role}-${String(key)}-toggle`}
                  >
                    <span className="text-sm">{value !== null ? t('overrides.override') : t('overrides.inherit')}</span>
                  </LabeledSwitch>
                  {value !== null ? (
                    <LabeledSwitch
                      isSelected={Boolean(value)}
                      onChange={(next) => setValue(key as OverrideKey, next)}
                      data-testid={`override-${role}-${String(key)}-value`}
                    >
                      <span className="text-sm">{value ? t('overrides.enabled') : t('overrides.disabled')}</span>
                    </LabeledSwitch>
                  ) : (
                    <span className="text-xs text-muted">
                      ↳ {t('overrides.inherit')}: {fallback ? t('overrides.enabled') : t('overrides.disabled')}
                    </span>
                  )}
                </div>
              </SettingsRow>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onPress={onClose} isDisabled={isSaving}>
          {t('overrides.cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={handleSave}
          isPending={isSaving}
          isDisabled={!isSavable}
          data-testid="policy-override-save"
        >
          {t('overrides.save')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}
