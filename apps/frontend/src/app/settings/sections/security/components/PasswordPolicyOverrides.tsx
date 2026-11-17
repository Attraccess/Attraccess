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
} from '@heroui/react';
import { useMemo, useState } from 'react';
import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { PasswordPolicyDto, PasswordPolicyOverrideDto, PasswordPolicyRole } from '@attraccess/react-query-client';
import { SettingsRow } from '../../../components/SettingsRow';
import { POLICY_FIELD_KEYS } from '../policy-fields';
import { RoleOverridesModal } from '../RoleOverridesModal';
import en from '../en.json';
import de from '../de.json';

const OVERRIDE_ROLES: PasswordPolicyRole[] = [PasswordPolicyRole.ADMIN];

interface PasswordPolicyOverridesProps {
  /** The stored global policy; the section loads it. */
  policy: PasswordPolicyDto;
  /** The stored per-role overrides; the section loads them. */
  overrides: PasswordPolicyOverrideDto[];
}

export function PasswordPolicyOverrides({ policy, overrides }: PasswordPolicyOverridesProps) {
  const { t } = useTranslations({ en, de });
  const [editingRole, setEditingRole] = useState<PasswordPolicyRole | null>(null);
  const overridesByRole = useMemo(() => new Map(overrides.map((row) => [row.role, row])), [overrides]);

  return (
    <>
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

      {/* `policy`, not `{ ...policy, ...policyDraft }`. The modal commits on its own, and inheritance
          resolves server-side against what is *stored* — so seeding an override from an unsaved edit
          would pin it to a value that never existed on the instance (and could then be Discarded),
          while the "inherit: N" hint would name a number no role would actually get. */}
      <RoleOverridesModal
        role={editingRole}
        existing={editingRole ? overridesByRole.get(editingRole) : undefined}
        globalPolicy={policy}
        onClose={() => setEditingRole(null)}
      />
    </>
  );
}
