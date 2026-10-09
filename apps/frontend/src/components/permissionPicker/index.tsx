import {
  Button,
  Autocomplete,
  Description,
  EmptyState,
  Header,
  Label,
  ListBox,
  SearchField,
  Tag,
  TagGroup,
} from '@heroui/react';
import { KeyRound, Pencil, LockIcon } from 'lucide-react';
import { PermissionPickerProps, usePermissionPickerState, PermissionDrawer } from './components/PermissionDrawer';
import type { Key } from '@heroui/react';

type Props = Pick<
  ReturnType<typeof usePermissionPickerState>,
  | 'placeholder'
  | 'selectedKeys'
  | 'onChange'
  | 'isAutocompleteOpen'
  | 'setIsAutocompleteOpen'
  | 'disabledKeys'
  | 'isDisabled'
  | 'label'
  | 'dataCy'
  | 'handleRemoveTags'
  | 'selectedTagItems'
  | 'lockedTagIndicator'
  | 'contains'
  | 'searchPlaceholder'
  | 'searchDataCy'
  | 'lockedHint'
  | 'emptyMessage'
  | 'permissionsByCategory'
  | 'permissionCategory'
  | 'permissionLabel'
  | 'itemDataCy'
  | 'permissionDescription'
>;

export function PermissionPickerAutocomplete({
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
}: Props) {
  return (
    <Autocomplete
      fullWidth
      placeholder={placeholder}
      selectionMode="multiple"
      value={[...selectedKeys]}
      onChange={(keys) => onChange(keys as Key[])}
      isOpen={isAutocompleteOpen}
      onOpenChange={setIsAutocompleteOpen}
      disabledKeys={disabledKeys}
      isDisabled={isDisabled}
      aria-label={label}
      data-cy={dataCy}
    >
      <Autocomplete.Trigger>
        <Autocomplete.Value>
          {({ defaultChildren, isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) return defaultChildren;
            return (
              <TagGroup size="sm" aria-label={label} onRemove={handleRemoveTags}>
                <TagGroup.List>
                  {selectedTagItems.map(({ key, label: permissionName, isLocked }) => (
                    <Tag
                      key={key}
                      id={key}
                      textValue={
                        isLocked && lockedTagIndicator ? `${permissionName} ${lockedTagIndicator}` : permissionName
                      }
                    >
                      {(renderProps) => (
                        <>
                          {isLocked ? <LockIcon className="w-3 h-3" aria-hidden="true" /> : null}
                          {permissionName}
                          {renderProps.allowsRemoving && !isLocked ? <Tag.RemoveButton /> : null}
                        </>
                      )}
                    </Tag>
                  ))}
                </TagGroup.List>
              </TagGroup>
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover>
        <Autocomplete.Filter filter={contains}>
          <SearchField autoFocus name="permission-search" variant="secondary">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                placeholder={searchPlaceholder}
                data-cy={searchDataCy}
                onKeyDownCapture={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setIsAutocompleteOpen(false);
                }}
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          {disabledKeys.length > 0 && lockedHint ? (
            <p className="flex items-center gap-1 px-2 py-1 text-xs text-default-400">
              <LockIcon className="w-3 h-3 shrink-0" />
              {lockedHint}
            </p>
          ) : null}
          <ListBox aria-label={label} renderEmptyState={() => <EmptyState>{emptyMessage}</EmptyState>}>
            {permissionsByCategory.map(({ category, permissions: categoryPermissions }) => (
              <ListBox.Section key={category} id={category}>
                <Header>{permissionCategory(category)}</Header>
                {categoryPermissions.map((permission) => (
                  <ListBox.Item
                    key={permission.key}
                    id={permission.key}
                    textValue={permissionLabel(permission)}
                    data-cy={itemDataCy?.(permission.key)}
                  >
                    <div className="flex flex-col">
                      <Label>{permissionLabel(permission)}</Label>
                      <Description>{permissionDescription(permission)}</Description>
                    </div>
                    {disabledKeys.includes(permission.key) ? (
                      <LockIcon className="w-3.5 h-3.5 text-default-400 shrink-0" />
                    ) : null}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox.Section>
            ))}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}

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

        <PermissionDrawer
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
