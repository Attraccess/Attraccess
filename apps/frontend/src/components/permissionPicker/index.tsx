import { Button } from '@heroui/react';
import { KeyRound, Pencil } from 'lucide-react';
import { PermissionPickerProps } from './index.permission-picker-props';
import { usePermissionPickerState } from './usePermissionPickerState';
import { PermissionPickerStandardDrawer } from './PermissionPickerStandardDrawer';
import { PermissionPickerAutocomplete } from './PermissionPickerAutocomplete';

export function PermissionPicker({
  permissions,
  selectedKeys,
  onChange,
  disabledKeys = [],
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  lockedHint,
  lockedTagIndicator,
  permissionLabel,
  permissionDescription,
  permissionCategory,
  dataCy,
  searchDataCy,
  itemDataCy,
  isDisabled,
  presentation = 'autocomplete',
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
}: PermissionPickerProps) {
  const {
    contains,
    permissionsByCategory,
    selectedTagItems,
    handleRemoveTags,
    isDrawerOpen,
    setIsDrawerOpen,
    isAutocompleteOpen,
    setIsAutocompleteOpen,
    draftKeys,
    updateDraft,
    updateCategory,
  } = usePermissionPickerState({
    permissions,
    selectedKeys,
    onChange,
    disabledKeys,
    label,
    placeholder,
    searchPlaceholder,
    emptyMessage,
    lockedHint,
    lockedTagIndicator,
    permissionLabel,
    permissionDescription,
    permissionCategory,
    dataCy,
    searchDataCy,
    itemDataCy,
    isDisabled,
    presentation,
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
  });

  if (presentation === 'drawer') {
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

        <PermissionPickerStandardDrawer
          {...{
            isDrawerOpen,
            setIsDrawerOpen,
            drawerTitle,
            label,
            drawerDescription,
            permissionsByCategory,
            disabledKeys,
            draftKeys,
            permissionCategory,
            updateCategory,
            drawerClearCategoryLabel,
            drawerSelectCategoryLabel,
            updateDraft,
            itemDataCy,
            permissionLabel,
            permissionDescription,
            drawerCancelLabel,
            onChange,
            drawerApplyLabel,
          }}
        />
      </>
    );
  }

  return (
    <PermissionPickerAutocomplete
      {...{
        placeholder,
        selectedKeys,
        onChange,
        isAutocompleteOpen,
        setIsAutocompleteOpen,
        disabledKeys,
        isDisabled,
        label,
        dataCy,
        handleRemoveTags,
        selectedTagItems,
        lockedTagIndicator,
        contains,
        searchPlaceholder,
        searchDataCy,
        lockedHint,
        emptyMessage,
        permissionsByCategory,
        permissionCategory,
        permissionLabel,
        itemDataCy,
        permissionDescription,
      }}
    />
  );
}
