import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
} from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { NetworkRestrictedAction, NetworkRestrictionRoleActionsDto } from '@attraccess/react-query-client';
import { useRbacCatalogTranslations } from '../../../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';

interface NetworkRestrictionRoleTableProps {
  roles: NetworkRestrictionRoleActionsDto[];
  actions: NetworkRestrictedAction[];
  /** The actions each role allows from outside, as edited (by role id). */
  value: Record<number, NetworkRestrictedAction[]>;
  onToggle: (roleId: number, action: NetworkRestrictedAction, allowed: boolean) => void;
}

/** Roles as rows, restricted actions as columns: a checked box lets the role's members do it from outside. */
export function NetworkRestrictionRoleTable({
  roles,
  actions,
  value,
  onToggle,
}: Readonly<NetworkRestrictionRoleTableProps>) {
  const { t } = useTranslations({ en, de });
  const { roleName } = useRbacCatalogTranslations();
  return (
    <Table>
      <TableScrollContainer>
        <TableContent aria-label={t('roles.ariaLabel')} data-testid="network-restriction-role-table">
          <TableHeader>
            <TableColumn isRowHeader>{t('roles.role')}</TableColumn>
            {actions.map((action) => (
              <TableColumn key={action} id={action} className="text-center">
                {t(`actions.${action}`)}
              </TableColumn>
            ))}
          </TableHeader>
          <TableBody items={roles} dependencies={[t, value]}>
            {(role) => (
              <TableRow key={role.roleId} id={role.roleId} data-cy={`network-restriction-role-${role.key}`}>
                <TableCell>{roleName(role)}</TableCell>
                {actions.map((action) => (
                  <TableCell key={action} className="text-center">
                    <Checkbox
                      aria-label={t('roles.allow', { role: roleName(role), action: t(`actions.${action}`) })}
                      isSelected={(value[role.roleId] ?? role.actions).includes(action)}
                      onChange={(allowed) => onToggle(role.roleId, action, allowed)}
                      data-cy={`network-restriction-${role.key}-${action}`}
                    >
                      <Checkbox.Content>
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox.Content>
                    </Checkbox>
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </TableContent>
      </TableScrollContainer>
    </Table>
  );
}
