import { useCallback, useState } from 'react';
import {
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableContent,
  TableHeader,
  TableRow,
  TableScrollContainer,
  TextField,
  Tooltip,
  TooltipContent,
  useOverlayState,
} from '@heroui/react';
import { Plus, Trash } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Role } from '@attraccess/react-query-client';
import { Button } from '../../../../components/button';
import { StandardDrawer } from '../../../../components/standardDrawer';
import { Select } from '../../../../components/select';
import { RoleMappingEntry } from '../formDefaults';
import en from '../en.json';
import de from '../de.json';

interface RoleMappingsSectionProps {
  variant: 'oidc' | 'saml';
  roles: Role[] | undefined;
  isLoadingRoles: boolean;
  entries: RoleMappingEntry[];
  onChange: (entries: RoleMappingEntry[]) => void;
}

export const RoleMappingsSection = ({ variant, roles, isLoadingRoles, entries, onChange }: RoleMappingsSectionProps) => {
  const { t } = useTranslations({ en, de });
  const { isOpen, open, close } = useOverlayState();
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | undefined>(undefined);
  const [ssoRoleInput, setSsoRoleInput] = useState('');

  const roleName = useCallback(
    (roleKey: string) => (roles ?? []).find((r) => r.key === roleKey)?.name ?? roleKey,
    [roles],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setSelectedRoleKey(undefined);
        setSsoRoleInput('');
        close();
        return;
      }
      open();
    },
    [open, close],
  );

  const trimmedSsoRole = ssoRoleInput.trim();
  const isDuplicate =
    !!selectedRoleKey && entries.some((e) => e.roleKey === selectedRoleKey && e.ssoRole === trimmedSsoRole);
  const canAdd = !!selectedRoleKey && trimmedSsoRole.length > 0 && !isDuplicate;

  const handleAdd = useCallback(() => {
    if (!selectedRoleKey || trimmedSsoRole.length === 0) {
      return;
    }
    onChange([...entries, { roleKey: selectedRoleKey, ssoRole: trimmedSsoRole }]);
    handleOpenChange(false);
  }, [entries, onChange, selectedRoleKey, trimmedSsoRole, handleOpenChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(entries.filter((_, i) => i !== index));
    },
    [entries, onChange],
  );

  return (
    <section className="w-full flex flex-col gap-4 pt-6 border-t border-default-200 first:pt-0 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('roleMappings')}</h3>
        <Button
          variant="ghost"
          onPress={() => handleOpenChange(true)}
          data-cy={`sso-provider-form-${variant}-role-mappings-add-button`}
        >
          <Plus size={16} />
          {t('roleMappingsAdd')}
        </Button>
      </div>
      <p className="text-xs text-default-500">{t('roleMappingsHint')}</p>

      {entries.length === 0 ? (
        <div
          className="text-center text-sm text-default-500 p-6 rounded-lg border border-dashed border-default-300"
          data-cy={`sso-provider-form-${variant}-role-mappings-empty`}
        >
          {t('roleMappingsEmpty')}
        </div>
      ) : (
        <Table data-cy={`sso-provider-form-${variant}-role-mappings-table`}>
          <TableScrollContainer>
            <TableContent aria-label={t('roleMappings')}>
              <TableHeader>
                <TableColumn isRowHeader>{t('roleMappingsAttraccessRole')}</TableColumn>
                <TableColumn>{t('roleMappingsSsoRole')}</TableColumn>
                <TableColumn>{t('roleMappingsActions')}</TableColumn>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={`${entry.roleKey}-${entry.ssoRole}`} id={`${entry.roleKey}-${entry.ssoRole}`}>
                    <TableCell>{roleName(entry.roleKey)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{entry.ssoRole}</span>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <Button
                          variant="danger-soft"
                          isIconOnly
                          onPress={() => handleRemove(index)}
                          data-cy={`sso-provider-form-${variant}-role-mapping-remove-${entry.roleKey}-${entry.ssoRole}`}
                        >
                          <Trash size={16} />
                        </Button>
                        <TooltipContent>{t('roleMappingsRemove')}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </TableContent>
          </TableScrollContainer>
        </Table>
      )}

      <StandardDrawer isOpen={isOpen} onOpenChange={handleOpenChange}>
        <DrawerHeader>
          <h2 className="text-lg font-semibold">{t('roleMappingsDrawerTitle')}</h2>
        </DrawerHeader>
        <DrawerBody className="flex flex-col gap-4">
          <p className="text-small text-default-500">{t('roleMappingsDrawerDescription')}</p>
          <Select
            label={t('roleMappingsAttraccessRole')}
            placeholder={t('roleMappingsRolePlaceholder')}
            value={selectedRoleKey}
            onChange={(key) => setSelectedRoleKey(key)}
            items={(roles ?? []).map((role) => ({ key: role.key, label: role.name ?? role.key }))}
            isLoading={isLoadingRoles}
            data-cy={`sso-provider-form-${variant}-role-mapping-role-select`}
          />
          <TextField value={ssoRoleInput} onChange={setSsoRoleInput}>
            <Label>{t('roleMappingsSsoRole')}</Label>
            <Input
              placeholder={t('roleMappingsPlaceholder')}
              data-cy={`sso-provider-form-${variant}-role-mapping-sso-role-input`}
            />
          </TextField>
          {isDuplicate && <p className="text-sm text-danger">{t('roleMappingsDuplicate')}</p>}
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost" onPress={() => handleOpenChange(false)}>
            {t('roleMappingsCancel')}
          </Button>
          <Button
            variant="primary"
            onPress={handleAdd}
            isDisabled={!canAdd}
            data-cy={`sso-provider-form-${variant}-role-mapping-submit-button`}
          >
            {t('roleMappingsAdd')}
          </Button>
        </DrawerFooter>
      </StandardDrawer>
    </section>
  );
};
