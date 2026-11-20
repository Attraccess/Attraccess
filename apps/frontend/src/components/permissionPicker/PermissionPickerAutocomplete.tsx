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
  useFilter,
} from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Key } from '@heroui/react';
import { groupPermissionsByCategory } from './groupPermissionsByCategory';
import type { PermissionPickerProps } from './permissionPickerTypes';

/** The permission picker as a searchable multi-select with removable tags. */
export function PermissionPickerAutocomplete({
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
}: Readonly<PermissionPickerProps>) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const permissionByKey = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions],
  );
  const permissionsByCategory = useMemo(() => groupPermissionsByCategory(permissions), [permissions]);
  const selectedTagItems = useMemo(
    () =>
      [...selectedKeys].map((key) => {
        const permission = permissionByKey.get(key);
        return { key, label: permission ? permissionLabel(permission) : key, isLocked: disabledKeys.includes(key) };
      }),
    [disabledKeys, permissionByKey, permissionLabel, selectedKeys],
  );

  const handleRemoveTags = (keys: Set<Key>) => {
    onChange([...selectedKeys].filter((key) => !keys.has(key) || disabledKeys.includes(key)));
  };

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
                <Header>{permissionCategory(category, categoryPermissions[0])}</Header>
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
