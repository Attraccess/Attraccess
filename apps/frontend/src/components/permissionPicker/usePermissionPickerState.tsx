import { useEffect, useMemo, useState } from 'react';
import { useFilter, type Key } from '@heroui/react';
import { type Permission } from '@attraccess/react-query-client';
import { CATEGORY_ORDER } from './index.category-order';
import { PermissionPickerProps } from './index.permission-picker-props';
export function usePermissionPickerState({
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
  const { contains } = useFilter({ sensitivity: 'base' });
  const permissionByKey = useMemo(
    () => new Map(permissions.map((permission) => [permission.key, permission])),
    [permissions],
  );
  const permissionsByCategory = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of permissions) {
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

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [draftKeys, setDraftKeys] = useState<Set<string>>(() => new Set(selectedKeys));

  useEffect(() => {
    if (isDrawerOpen) setDraftKeys(new Set(selectedKeys));
  }, [isDrawerOpen, selectedKeys]);

  const updateDraft = (key: string, isSelected: boolean) => {
    if (disabledKeys.includes(key)) return;
    setDraftKeys((current) => {
      const next = new Set(current);
      if (isSelected) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const updateCategory = (categoryPermissions: Permission[], isSelected: boolean) => {
    setDraftKeys((current) => {
      const next = new Set(current);
      for (const permission of categoryPermissions) {
        if (disabledKeys.includes(permission.key)) continue;
        if (isSelected) next.add(permission.key);
        else next.delete(permission.key);
      }
      return next;
    });
  };
  return {
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
  };
}
