import { useEffect, useMemo, useState } from 'react';
import { type Key } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { type SystemPermission } from '@attraccess/shared';
import {
  ApiError,
  Permission,
  useRbacServiceCreateRole,
  useRbacServiceListPermissions,
  useRbacServiceListRolesKey,
  useRbacServiceUpdateRole,
} from '@attraccess/react-query-client';
import { useToastMessage } from '../../../components/toastProvider';
import { useAuth } from '../../../hooks/useAuth';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';
import { CATEGORY_ORDER } from './index.category-order';
import { Props } from './index.props';
export function useRoleFormDrawerState({ isOpen, onOpenChange, role }: Props) {
  const { t, tExists } = useTranslations({
    en: { ...en, api: API_ERROR_TRANSLATIONS_EN },
    de: { ...de, api: API_ERROR_TRANSLATIONS_DE },
  });
  const { permissionLabel, permissionDescription, permissionCategory, roleName, roleDescription } =
    useRbacCatalogTranslations();
  const toast = useToastMessage();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();

  const isReadOnly = !!role?.isSystemManaged;
  const mode = role === null ? 'create' : isReadOnly ? 'view' : 'edit';

  const { data: permissions } = useRbacServiceListPermissions(undefined, { enabled: isOpen });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setName(role ? roleName(role) : '');
    setDescription(role ? roleDescription(role) : '');
    setSelectedKeys(new Set((role?.rolePermissions ?? []).map((rp) => rp.permissionKey)));
  }, [isOpen, role, roleName, roleDescription]);

  const permissionsByCategory = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of permissions ?? []) {
      const group = groups.get(permission.category) ?? [];
      group.push(permission);
      groups.set(permission.category, group);
    }
    const categories = [...groups.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
    });
    return categories.map((category) => ({ category, permissions: groups.get(category) as Permission[] }));
  }, [permissions]);

  // Permissions the acting user does not hold: visible but locked (grant safety)
  const nonGrantableKeys = useMemo(
    () => (permissions ?? []).filter((p) => !hasPermission(p.key as SystemPermission)).map((p) => p.key),
    [permissions, hasPermission],
  );

  // Locked keys can be neither added nor removed, no matter how the change was triggered
  const applySelection = (keys: Iterable<Key>) => {
    setSelectedKeys((prev) => {
      const next = new Set([...keys].map(String));
      for (const key of nonGrantableKeys) {
        if (prev.has(key)) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const close = () => onOpenChange(false);

  const onMutationSuccess = (messageKey: string) => {
    queryClient.invalidateQueries({ queryKey: [useRbacServiceListRolesKey] });
    toast.success({ title: t(messageKey) });
    close();
  };

  const onMutationError = (error: unknown) => {
    toast.apiError({ error: error as ApiError, t, tExists, baseTranslationKey: 'api', fallbackKey: 'generic' });
  };

  const { mutate: createRole, isPending: isCreating } = useRbacServiceCreateRole({
    onSuccess: () => onMutationSuccess('messages.created'),
    onError: onMutationError,
  });
  const { mutate: updateRole, isPending: isUpdating } = useRbacServiceUpdateRole({
    onSuccess: () => onMutationSuccess('messages.updated'),
    onError: onMutationError,
  });
  const isSaving = isCreating || isUpdating;

  const handleSave = () => {
    const requestBody = {
      name: name.trim(),
      description: description.trim(),
      permissionKeys: [...selectedKeys],
    };
    if (role === null) {
      createRole({ requestBody });
    } else {
      updateRole({ id: role.id, requestBody });
    }
  };
  return {
    t,
    permissionLabel,
    permissionDescription,
    permissionCategory,
    isReadOnly,
    mode,
    permissions,
    name,
    setName,
    description,
    setDescription,
    selectedKeys,
    permissionsByCategory,
    nonGrantableKeys,
    applySelection,
    close,
    isSaving,
    handleSave,
    isOpen,
    onOpenChange,
    role,
  };
}
