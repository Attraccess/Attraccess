import {
  Autocomplete,
  Description,
  EmptyState,
  Header,
  Label,
  ListBox,
  SearchField,
  Tag,
  TagGroup,
  type Key,
} from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { usePermissionPickerState } from './usePermissionPickerState';
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
