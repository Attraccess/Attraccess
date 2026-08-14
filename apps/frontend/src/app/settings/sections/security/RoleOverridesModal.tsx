import { useEffect, useState } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';
import {
  PasswordPolicyDto,
  PasswordPolicyOverrideDto,
  PasswordPolicyRole,
  UpsertPasswordPolicyOverrideDto,
  UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn,
  usePasswordPolicyAdminServiceDeletePasswordPolicyOverride,
  usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride,
} from '@attraccess/react-query-client';
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { useToastMessage } from '../../../../components/toastProvider';
import { POLICY_BOOL_FIELDS, POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from './policy-fields';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

type OverrideKey = keyof PasswordPolicyOverrideDto;
/** `null` is a real value here — "inherit" — so an untouched field is `undefined`, not `null`. */
type OverrideDraft = Partial<Record<string, number | boolean | null>>;

interface Props {
  role: PasswordPolicyRole | null;
  existing: PasswordPolicyOverrideDto | undefined;
  globalPolicy: PasswordPolicyDto;
  t: Translate;
  onClose: () => void;
}

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
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  // Derived, like every other draft in this section. Seeding a full copy from `existing` meant the
  // effect re-ran on every refetch of the overrides list — and the query client has
  // `refetchOnWindowFocus: true` with no `staleTime`, so tabbing away and back mid-edit replaced
  // twelve fields of in-progress work with the server row. That is exactly the ATT-868 clobber the
  // rest of this section exists to remove.
  const [draft, setDraft] = useState<OverrideDraft>({});

  // Keyed on the role alone, so it fires when the editor opens or closes — never on a refetch.
  useEffect(() => setDraft({}), [role]);

  const valueOf = (key: OverrideKey) =>
    key in draft ? (draft[key as string] ?? null) : ((existing?.[key] ?? null) as number | boolean | null);
  const setValue = (key: OverrideKey, value: number | boolean | null) =>
    setDraft((current) => ({ ...current, [key as string]: value }));

  const isAllInherit = POLICY_FIELD_KEYS.every((key) => valueOf(key as OverrideKey) === null);

  // A cleared NumberField is React Aria's `NaN`, which is neither `null` nor a number — and
  // `JSON.stringify` turns it into `null` on the wire, which the API accepts as the explicit
  // "inherit" value. So saving a cleared field would silently drop the override back to the global
  // policy under a success toast. Same `Number.isInteger` gate the section uses; the modal stays
  // open so the offending field is still reachable.
  const isSavable = POLICY_NUMBER_FIELDS.every(({ key }) => {
    const value = valueOf(key as OverrideKey);
    return value === null || Number.isInteger(value);
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn() });

  const { mutate: upsert, isPending: isUpserting } = usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride({
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success({
        title: t('overrides.saved.title'),
        description: t('overrides.saved.description', { role: t(`overrides.roles.${vars.role}`) }),
      });
      onClose();
    },
    onError: () => toast.error({ title: t('errorToast.title'), description: t('errorToast.description') }),
  });

  const { mutate: remove, isPending: isRemoving } = usePasswordPolicyAdminServiceDeletePasswordPolicyOverride({
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success({
        title: t('overrides.removed.title'),
        description: t('overrides.removed.description', { role: t(`overrides.roles.${vars.role}`) }),
      });
      onClose();
    },
    onError: () => toast.error({ title: t('errorToast.title'), description: t('errorToast.description') }),
  });

  const isSaving = isUpserting || isRemoving;

  const handleSave = () => {
    if (!role || !isSavable) return;

    // Turning every field back to "inherit" is how an operator deletes an override; there is no
    // separate Remove inside the editor because "override nothing" and "no override" are the same
    // state, and storing an all-null row would be a lie about intent.
    if (isAllInherit) {
      if (existing) {
        remove({ role });
      } else {
        onClose();
      }
      return;
    }

    const requestBody: UpsertPasswordPolicyOverrideDto = {};
    POLICY_FIELD_KEYS.forEach((key) => {
      (requestBody as Record<string, unknown>)[key as string] = valueOf(key as OverrideKey);
    });
    upsert({ role, requestBody });
  };

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
