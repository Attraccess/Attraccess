import { Button, Chip, DrawerBody, DrawerFooter, DrawerHeader, Input, Label, TextArea, TextField } from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { StandardDrawer } from '../../../components/standardDrawer';
import { PermissionPicker } from '../../../components/permissionPicker';
import { Props } from './index.props';
import { useRoleFormDrawerState } from './useRoleFormDrawerState';

export function RoleFormDrawer({ isOpen, onOpenChange, role }: Props) {
  const {
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
  } = useRoleFormDrawerState({ isOpen, onOpenChange, role });

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
