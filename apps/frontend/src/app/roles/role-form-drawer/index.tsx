import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  Label,
  TextArea,
  TextField,
  type Key,
} from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { type SystemPermission } from '@attraccess/shared';
import {
  ApiError,
  Permission,
  RoleWithUsageDto,
  useRbacServiceCreateRole,
  useRbacServiceListPermissions,
  useRbacServiceListRolesKey,
  useRbacServiceUpdateRole,
} from '@attraccess/react-query-client';
import { StandardDrawer } from '../../../components/standardDrawer';
import { PermissionPicker } from '../../../components/permissionPicker';
import { useToastMessage } from '../../../components/toastProvider';
import { useAuth } from '../../../hooks/useAuth';
import { useRbacCatalogTranslations } from '../../../hooks/useRbacCatalogTranslations';
import en from './en.json';
import de from './de.json';
import API_ERROR_TRANSLATIONS_EN from '../../../global-translations/api-errors.en.json';
import API_ERROR_TRANSLATIONS_DE from '../../../global-translations/api-errors.de.json';

const CATEGORY_ORDER = ['resources', 'users', 'system', 'billing'];

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleWithUsageDto | null;
}

export function RoleFormDrawer({ isOpen, onOpenChange, role }: Props) {
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

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerHeader>
        <h2 className="text-lg font-semibold" data-cy="role-form-drawer-title">
          {t(`title.${mode}`)}
        </h2>
      </DrawerHeader>
      <DrawerBody>
        <div className="flex flex-col gap-4">
          {isReadOnly ? (
            <div
              className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-warning-700"
              data-cy="role-form-drawer-system-banner"
            >
              <p className="text-sm font-semibold flex items-center gap-1">
                <LockIcon className="w-3.5 h-3.5" />
                {t('systemRoleBanner.title')}
              </p>
              <p className="text-sm">{t('systemRoleBanner.description')}</p>
            </div>
          ) : null}

          <TextField value={name} onChange={setName} isDisabled={isReadOnly} isRequired>
            <Label>{t('inputs.name.label')}</Label>
            <Input name="name" data-cy="role-form-drawer-name-input" />
          </TextField>

          <TextField value={description} onChange={setDescription} isDisabled={isReadOnly}>
            <Label>{t('inputs.description.label')}</Label>
            <TextArea name="description" data-cy="role-form-drawer-description-input" />
          </TextField>

          <div className="flex items-baseline justify-between">
            <h3 className="text-sm uppercase tracking-wide font-semibold text-default-700">{t('permissions.title')}</h3>
            <span className="text-xs text-default-400">
              {t('permissions.selectedCount', { selected: selectedKeys.size, total: permissions?.length ?? 0 })}
            </span>
          </div>

          {isReadOnly ? (
            <div className="flex flex-col gap-3" data-cy="role-form-drawer-readonly-permissions">
              {permissionsByCategory
                .map(({ category, permissions: categoryPermissions }) => ({
                  category,
                  selected: categoryPermissions.filter((p) => selectedKeys.has(p.key)),
                }))
                .filter(({ selected }) => selected.length > 0)
                .map(({ category, selected }) => (
                  <div key={category} className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold text-default-500 uppercase tracking-wide">
                      {permissionCategory(category)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selected.map((permission) => (
                        <Chip key={permission.key} size="sm" variant="secondary">
                          {permissionLabel(permission)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <PermissionPicker
              permissions={permissions ?? []}
              selectedKeys={selectedKeys}
              onChange={applySelection}
              disabledKeys={nonGrantableKeys}
              label={t('permissions.title')}
              placeholder={t('permissions.pickerPlaceholder')}
              searchPlaceholder={t('permissions.searchPlaceholder')}
              emptyMessage={t('permissions.noResults')}
              lockedHint={t('permissions.cannotGrantHint')}
              lockedTagIndicator={t('permissions.lockedTagIndicator')}
              permissionLabel={permissionLabel}
              permissionDescription={permissionDescription}
              permissionCategory={permissionCategory}
              dataCy="role-form-drawer-permission-picker"
              searchDataCy="role-form-drawer-permission-search"
              itemDataCy={(permissionKey) => `role-form-drawer-permission-${permissionKey}`}
            />
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        {isReadOnly ? (
          <Button variant="secondary" onPress={close} data-cy="role-form-drawer-close-button">
            {t('actions.close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={close} data-cy="role-form-drawer-cancel-button">
              {t('actions.cancel')}
            </Button>
            <Button
              variant="primary"
              onPress={handleSave}
              isPending={isSaving}
              isDisabled={name.trim().length === 0}
              data-cy="role-form-drawer-save-button"
            >
              {t(role === null ? 'actions.create' : 'actions.save')}
            </Button>
          </>
        )}
      </DrawerFooter>
    </StandardDrawer>
  );
}
