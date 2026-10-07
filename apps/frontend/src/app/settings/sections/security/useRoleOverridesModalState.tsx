import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UpsertPasswordPolicyOverrideDto,
  UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn,
  usePasswordPolicyAdminServiceDeletePasswordPolicyOverride,
  usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../../components/toastProvider';
import { POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from './policy-fields';
import { OverrideKey } from './RoleOverridesModal.contracts';
import { OverrideDraft } from './RoleOverridesModal.contracts';
import { Props } from './RoleOverridesModal.contracts';
export function useRoleOverridesModalState({ role, existing, globalPolicy, t, onClose }: Props) {
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
  return { valueOf, setValue, isSavable, isSaving, handleSave, role, globalPolicy, t, onClose } as const;
}
