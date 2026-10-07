import { useState } from 'react';
import {
  RoleWithUsageDto,
  useRbacServiceListPermissions,
  useRbacServiceListRoles,
} from '@attraccess/react-query-client';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useRbacCatalogTranslations } from '../../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';
import { useNavigate } from 'react-router-dom';
export function useRolesSectionState() {
  const { t } = useTranslations({ en, de });
  const { permissionLabel, roleName, roleDescription } = useRbacCatalogTranslations();
  const navigate = useNavigate();

  const { data: roles, isLoading } = useRbacServiceListRoles();
  const { data: permissions } = useRbacServiceListPermissions();

  const [formRole, setFormRole] = useState<RoleWithUsageDto | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleWithUsageDto | null>(null);

  const openForm = (role: RoleWithUsageDto | null) => {
    setFormRole(role);
    setIsFormOpen(true);
  };
  return {
    t,
    permissionLabel,
    roleName,
    roleDescription,
    navigate,
    roles,
    isLoading,
    permissions,
    formRole,
    isFormOpen,
    setIsFormOpen,
    roleToDelete,
    setRoleToDelete,
    openForm,
  } as const;
}
