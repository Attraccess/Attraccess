import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
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
import en from './en.json';
import de from './de.json';

const ROLES: PasswordPolicyRole[] = [
  PasswordPolicyRole.ADMIN,
  PasswordPolicyRole.MACHINE,
  PasswordPolicyRole.API_TOKEN,
];

const NUMBER_FIELDS: Array<{ key: keyof UpsertPasswordPolicyOverrideDto; min: number; max: number }> = [
  { key: 'minLength', min: 1, max: 1024 },
  { key: 'maxLength', min: 1, max: 1024 },
  { key: 'minZxcvbnScore', min: 0, max: 4 },
  { key: 'historySize', min: 0, max: 50 },
  { key: 'rotationDays', min: 0, max: 3650 },
];

const BOOL_FIELDS: Array<keyof UpsertPasswordPolicyOverrideDto> = [
  'allowAllUnicode',
  'requireUppercase',
  'requireLowercase',
  'requireDigit',
  'requireSpecial',
  'checkHIBP',
  'checkCommonPasswords',
];

const ALL_KEYS = [...NUMBER_FIELDS.map((f) => f.key), ...BOOL_FIELDS];

function emptyOverride(): Required<PasswordPolicyOverrideDto> {
  return {
    role: PasswordPolicyRole.ADMIN,
    minLength: null,
    maxLength: null,
    allowAllUnicode: null,
    requireUppercase: null,
    requireLowercase: null,
    requireDigit: null,
    requireSpecial: null,
    checkHIBP: null,
    checkCommonPasswords: null,
    minZxcvbnScore: null,
    historySize: null,
    rotationDays: null,
  };
}

function countOverridden(row: PasswordPolicyOverrideDto | undefined): number {
  if (!row) return 0;
  return ALL_KEYS.reduce((acc, k) => acc + (row[k as keyof PasswordPolicyOverrideDto] !== null ? 1 : 0), 0);
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
      const existing = overridesByRole.get(editingRole) ?? { ...emptyOverride(), role: editingRole };
      setDraft({ ...existing });
    }
  }, [editingRole, overridesByRole]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: UsePasswordPolicyAdminServiceListPasswordPolicyOverridesKeyFn() });

  const { mutate: upsert, isPending: isSaving } = usePasswordPolicyAdminServiceUpsertPasswordPolicyOverride({
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

  const { mutate: remove } = usePasswordPolicyAdminServiceDeletePasswordPolicyOverride({
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success({
        title: t('overrides.removed.title'),
        description: t('overrides.removed.description', { role: t(`overrides.roles.${vars.role}`) }),
      });
    },
    onError: () => toast.error({ title: t('errorToast.title'), description: t('errorToast.description') }),
  });

  const handleSave = () => {
    if (!editingRole) return;
    const requestBody: UpsertPasswordPolicyOverrideDto = {};
    ALL_KEYS.forEach((k) => {
      const v = draft[k as keyof PasswordPolicyOverrideDto];
      (requestBody as Record<string, unknown>)[k as string] = v;
    });
    upsert({ role: editingRole, requestBody });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-1">
        <span className="text-base font-semibold">{t('overrides.title')}</span>
        <span className="text-sm text-default-500">{t('overrides.subtitle')}</span>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <Table removeWrapper aria-label="overrides" data-testid="policy-overrides-table">
            <TableHeader>
              <TableColumn>{t('overrides.role')}</TableColumn>
              <TableColumn>{t('overrides.status')}</TableColumn>
              <TableColumn align="end">{t('overrides.actions')}</TableColumn>
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
                        <Chip size="sm" variant="flat">{t('overrides.statusInherits')}</Chip>
                      ) : (
                        <Chip size="sm" color="warning" variant="flat">
                          {t('overrides.statusCustom', { count })}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setEditingRole(role)}
                        data-testid={`policy-override-edit-${role}`}
                      >
                        {t('overrides.edit')}
                      </Button>
                      {row && (
                        <Button
                          size="sm"
                          color="danger"
                          variant="flat"
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
          </Table>
        )}
      </CardBody>

      <Modal isOpen={editingRole !== null} onClose={() => setEditingRole(null)} size="3xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span>
              {t('overrides.modal.title', { role: editingRole ? t(`overrides.roles.${editingRole}`) : '' })}
            </span>
            <span className="text-sm font-normal text-default-500">{t('overrides.modal.subtitle')}</span>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4">
            {NUMBER_FIELDS.map(({ key, min, max }) => {
              const v = draft[key as keyof PasswordPolicyOverrideDto] as number | null;
              const overrideOn = v !== null;
              const fallback = globalPolicy[key as keyof PasswordPolicyDto] as number;
              return (
                <div key={String(key)} className="flex flex-col gap-2 rounded border border-default-200 p-3">
                  <Switch
                    isSelected={overrideOn}
                    onValueChange={(on) => setDraft({ ...draft, [key]: on ? fallback : null })}
                    data-testid={`override-${editingRole}-${key}-toggle`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
                      <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
                    </div>
                  </Switch>
                  {overrideOn ? (
                    <NumberInput
                      value={v ?? fallback}
                      onValueChange={(next) => setDraft({ ...draft, [key]: next })}
                      minValue={min}
                      maxValue={max}
                      variant="bordered"
                      size="sm"
                      data-testid={`override-${editingRole}-${key}-value`}
                    />
                  ) : (
                    <span className="text-xs text-default-400">↳ {t('overrides.inherit')}: {fallback}</span>
                  )}
                </div>
              );
            })}
            {BOOL_FIELDS.map((key) => {
              const v = draft[key as keyof PasswordPolicyOverrideDto] as boolean | null;
              const overrideOn = v !== null;
              const fallback = globalPolicy[key as keyof PasswordPolicyDto] as boolean;
              return (
                <div key={String(key)} className="flex flex-col gap-2 rounded border border-default-200 p-3">
                  <Switch
                    isSelected={overrideOn}
                    onValueChange={(on) => setDraft({ ...draft, [key]: on ? fallback : null })}
                    data-testid={`override-${editingRole}-${key}-toggle`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{t(`fields.${key}.label`)}</span>
                      <span className="text-xs text-default-500">{t(`fields.${key}.description`)}</span>
                    </div>
                  </Switch>
                  {overrideOn ? (
                    <Switch
                      isSelected={Boolean(v)}
                      onValueChange={(next) => setDraft({ ...draft, [key]: next })}
                      size="sm"
                      data-testid={`override-${editingRole}-${key}-value`}
                    >
                      {String(v)}
                    </Switch>
                  ) : (
                    <span className="text-xs text-default-400">↳ {t('overrides.inherit')}: {String(fallback)}</span>
                  )}
                </div>
              );
            })}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setEditingRole(null)} isDisabled={isSaving}>
              {t('overrides.cancel')}
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={isSaving}
              data-testid="policy-override-save"
            >
              {t('overrides.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}
