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
import { SettingsRow } from '../../components/SettingsRow';
import { Button } from '../../../../components/button';
import { POLICY_FIELD_KEYS } from './policy-fields';
import { OVERRIDE_ROLES } from './index.state';
import { useSecuritySectionState } from './useSecuritySectionState';
type Props = Pick<ReturnType<typeof useSecuritySectionState>, 't' | 'overridesByRole' | 'setEditingRole'>;
export function SecuritySectionSettingsRow({ t, overridesByRole, setEditingRole }: Props) {
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
