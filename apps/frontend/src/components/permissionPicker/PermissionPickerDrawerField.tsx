import { Button } from '@heroui/react';
import { KeyRound, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PermissionDrawer } from './components/PermissionDrawer';
import { groupPermissionsByCategory } from './groupPermissionsByCategory';
import type { PermissionPickerProps } from './permissionPickerTypes';

/** The permission picker as a summary button that opens a drawer to edit the selection by category. */
export function PermissionPickerDrawerField({
  permissions,
  selectedKeys,
  onChange,
  disabledKeys = [],
  label,
  placeholder,
  permissionLabel,
  permissionDescription,
  permissionCategory,
  dataCy,
  itemDataCy,
  isDisabled,
  drawerTitle,
  drawerDescription,
  drawerApplyLabel,
  drawerCancelLabel,
  drawerSelectedCount,
  drawerPreviewLabel,
  drawerEmptyPreview,
  drawerEditLabel,
  drawerSelectCategoryLabel,
  drawerClearCategoryLabel,
}: Readonly<PermissionPickerProps>) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const permissionsByCategory = useMemo(() => groupPermissionsByCategory(permissions), [permissions]);

  const selectedCount = selectedKeys.size;
  const totalCount = permissions.length;
  const selectedCategories = permissionsByCategory
    .map(({ category, permissions: categoryPermissions }) => ({
      category,
      selectedCount: categoryPermissions.filter((permission) => selectedKeys.has(permission.key)).length,
    }))
    .filter(({ selectedCount: categorySelectedCount }) => categorySelectedCount > 0);
  const previewCategories = selectedCategories.slice(0, 2);
  const hiddenPreviewCategoryCount = selectedCategories.length - previewCategories.length;

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        className="h-auto min-h-[88px] items-stretch justify-between gap-4 whitespace-normal rounded-medium border border-default-200 bg-content1 px-4 py-3 text-left shadow-none hover:border-primary/50 hover:bg-default-50"
        onPress={() => setIsDrawerOpen(true)}
        isDisabled={isDisabled}
        aria-label={label}
        data-cy={dataCy}
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-medium bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium text-foreground">{drawerPreviewLabel ?? label}</span>
            {previewCategories.length === 0 ? (
              <span className="text-sm text-default-500">{drawerEmptyPreview ?? placeholder}</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {previewCategories.map(({ category, selectedCount: categorySelectedCount }) => (
                  <span key={category} className="rounded-small bg-default-100 px-2 py-0.5 text-xs text-default-700">
                    {permissionCategory(category)} · {categorySelectedCount}
                  </span>
                ))}
                {hiddenPreviewCategoryCount > 0 ? (
                  <span className="rounded-small bg-default-100 px-2 py-0.5 text-xs text-default-600">
                    +{hiddenPreviewCategoryCount}
                  </span>
                ) : null}
              </span>
            )}
            <span className="text-xs tabular-nums text-default-500">
              {drawerSelectedCount?.(selectedCount, totalCount) ?? `${selectedCount}/${totalCount}`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 self-center text-sm font-medium text-primary">
          <span className="hidden xl:inline">{drawerEditLabel ?? placeholder}</span>
          <Pencil className="size-4" aria-hidden="true" />
        </span>
      </Button>

      <PermissionDrawer
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        permissionsByCategory={permissionsByCategory}
        selectedKeys={selectedKeys}
        disabledKeys={disabledKeys}
        onChange={onChange}
        label={label}
        drawerTitle={drawerTitle}
        drawerDescription={drawerDescription}
        drawerApplyLabel={drawerApplyLabel}
        drawerCancelLabel={drawerCancelLabel}
        drawerSelectCategoryLabel={drawerSelectCategoryLabel}
        drawerClearCategoryLabel={drawerClearCategoryLabel}
        itemDataCy={itemDataCy}
        permissionLabel={permissionLabel}
        permissionDescription={permissionDescription}
        permissionCategory={permissionCategory}
      />
    </>
  );
}
