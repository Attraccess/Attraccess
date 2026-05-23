import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Chip,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
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
} from '@heroui/react';
import { LabeledSwitch } from '../../../components/labeledSwitch';
import { useQueryClient } from '@tanstack/react-query';
import {
  PasswordPolicyDto,
  PasswordPolicyOverrideDto,
  PasswordPolicyRole,
  UpsertPasswordPolicyOverrideDto,
  UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn,
  usePasswordPolicyAdminServiceDeletePasswordPolicyOverride,
  usePasswordPolicyAdminServiceListPasswordPolicyOverrides,
  usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useToastMessage } from '../../../components/toastProvider';
import { POLICY_BOOL_FIELDS, POLICY_FIELD_KEYS, POLICY_NUMBER_FIELDS } from './policy-fields';
import en from './en.json';
import de from './de.json';

const ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

function emptyOverride(role: PasswordPolicyRole = PasswordPolicyRole.ADMIN): Required<PasswordPolicyOverrideDto> {
  const out = { role } as Required<PasswordPolicyOverrideDto>;
  for (const k of POLICY_FIELD_KEYS) {
    (out as unknown as Record<string, unknown>)[k as string] = null;
  }
  return out;
}

function countOverridden(row: PasswordPolicyOverrideDto | undefined): number {
  if (!row) return 0;
  return POLICY_FIELD_KEYS.reduce((acc, k) => acc + (row[k as keyof PasswordPolicyOverrideDto] !== null ? 1 : 0), 0);
}

function isAllInherit(draft: PasswordPolicyOverrideDto): boolean {
  return POLICY_FIELD_KEYS.every((k) => draft[k as keyof PasswordPolicyOverrideDto] === null);
}

interface Props {
  globalPolicy: PasswordPolicyDto;
}

export function OverridesSection({ globalPolicy }: Props) {
  const { t } = useTranslations({ en, de });
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = usePasswordPolicyAdminServiceListPasswordPolicyOverrides();
  const [editingRole, setEditingRole] = useState<PasswordPolicyRole | null>(null);
  const [draft, setDraft] = useState<PasswordPolicyOverrideDto>(emptyOverride());

  const overridesByRole = useMemo(() => {
    const map = new Map<PasswordPolicyRole, PasswordPolicyOverrideDto>();
    rows.forEach((r) => map.set(r.role, r));
    return map;
  }, [rows]);

  useEffect(() => {
    if (editingRole) {
      const existing = overridesByRole.get(editingRole) ?? emptyOverride(editingRole);
      setDraft({ ...existing });
    }
  }, [editingRole, overridesByRole]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn() });

  const { mutate: upsert, isPending: isUpserting } = usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride({
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success({
        title: t('overrides.saved.title'),
        description: t('overrides.saved.description', { role: t(`overrides.roles.${vars.role}`) }),
      });
      setEditingRole(null);
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
      if (editingRole === vars.role) {
        setEditingRole(null);
      }
    },
    onError: () => toast.error({ title: t('errorToast.title'), description: t('errorToast.description') }),
  });

  const isSaving = isUpserting || isRemoving;

  const handleSave = () => {
    if (!editingRole) return;
    if (isAllInherit(draft)) {
      const existing = overridesByRole.get(editingRole);
      if (existing) {
        remove({ role: editingRole });
      } else {
        setEditingRole(null);
      }
      return;
    }
    const requestBody: UpsertPasswordPolicyOverrideDto = {};
    POLICY_FIELD_KEYS.forEach((k) => {
      const v = draft[k as keyof PasswordPolicyOverrideDto];
      (requestBody as Record<string, unknown>)[k as string] = v;
    });
    upsert({ role: editingRole, requestBody });
  };

  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('overrides.title')}</span>
        <span className="text-sm text-default-500">{t('overrides.subtitle')}</span>
      </Card.Header>
      <Card.Content>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <Table aria-label="overrides" data-testid="policy-overrides-table">
            <TableContent>
              <TableHeader>
                <TableColumn isRowHeader>{t('overrides.role')}</TableColumn>
                <TableColumn>{t('overrides.status')}</TableColumn>
                <TableColumn>{t('overrides.actions')}</TableColumn>
              </TableHeader>
              <TableBody>
                {ROLES.map((role) => {
                  const row = overridesByRole.get(role);
                  const count = countOverridden(row);
                  return (
                    <TableRow key={role} data-testid={`policy-override-row-${role}`}>
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
                      <TableCell className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onPress={() => setEditingRole(role)}
                          data-testid={`policy-override-edit-${role}`}
                        >
                          {t('overrides.edit')}
                        </Button>
                        {row && (
                          <Button
                            variant="danger-soft"
                            onPress={() => remove({ role })}
                            data-testid={`policy-override-remove-${role}`}
                          >
                            {t('overrides.remove')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TableContent>
          </Table>
        )}
      </Card.Content>

      <Modal
        isOpen={editingRole !== null}
        onOpenChange={(open) => !open && setEditingRole(null)}
      >
        <ModalBackdrop>
          <ModalContainer size="lg">
            <ModalDialog>
              <ModalHeader className="flex flex-col gap-1">
                <span>
                  {t('overrides.modal.title', { role: editingRole ? t(`overrides.roles.${editingRole}`) : '' })}
                </span>
                <span className="text-sm font-normal text-default-500">{t('overrides.modal.subtitle')}</span>
              </ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                {POLICY_NUMBER_FIELDS.map(({ key, min, max }) => {
                  const v = draft[key as keyof PasswordPolicyOverrideDto] as number | null;
                  const overrideOn = v !== null;
                  const fallback = globalPolicy[key as keyof PasswordPolicyDto] as number;
                  return (
                    <div key={String(key)} className="flex flex-col gap-2 rounded border border-default-200 p-3">
                      <LabeledSwitch
                        isSelected={overrideOn}
                        onChange={(on) => setDraft({ ...draft, [key]: on ? fallback : null })}
                        data-testid={`override-${editingRole}-${key}-toggle`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
                          <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
                        </div>
                      </LabeledSwitch>
                      {overrideOn ? (
                        <NumberField
                          value={v ?? fallback}
                          onChange={(next) => setDraft({ ...draft, [key]: next })}
                          minValue={min}
                          maxValue={max}
                        >
                          <NumberFieldGroup>
                            <NumberFieldDecrementButton>-</NumberFieldDecrementButton>
                            <NumberFieldInput data-testid={`override-${editingRole}-${key}-value`} />
                            <NumberFieldIncrementButton>+</NumberFieldIncrementButton>
                          </NumberFieldGroup>
                        </NumberField>
                      ) : (
                        <span className="text-xs text-default-400">
                          ↳ {t('overrides.inherit')}: {fallback}
                        </span>
                      )}
                    </div>
                  );
                })}
                {POLICY_BOOL_FIELDS.map((key) => {
                  const v = draft[key as keyof PasswordPolicyOverrideDto] as boolean | null;
                  const overrideOn = v !== null;
                  const fallback = globalPolicy[key as keyof PasswordPolicyDto] as boolean;
                  return (
                    <div key={String(key)} className="flex flex-col gap-2 rounded border border-default-200 p-3">
                      <LabeledSwitch
                        isSelected={overrideOn}
                        onChange={(on) => setDraft({ ...draft, [key]: on ? fallback : null })}
                        data-testid={`override-${editingRole}-${key}-toggle`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
                          <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
                        </div>
                      </LabeledSwitch>
                      {overrideOn ? (
                        <LabeledSwitch
                          isSelected={Boolean(v)}
                          onChange={(next) => setDraft({ ...draft, [key]: next })}
                          data-testid={`override-${editingRole}-${key}-value`}
                        >
                          {String(v)}
                        </LabeledSwitch>
                      ) : (
                        <span className="text-xs text-default-400">
                          ↳ {t('overrides.inherit')}: {String(fallback)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onPress={() => setEditingRole(null)} isDisabled={isSaving}>
                  {t('overrides.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleSave}
                  isPending={isSaving}
                  data-testid="policy-override-save"
                >
                  {t('overrides.save')}
                </Button>
              </ModalFooter>
            </ModalDialog>
          </ModalContainer>
        </ModalBackdrop>
      </Modal>
    </Card>
  );
}
