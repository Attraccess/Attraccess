import { type Key } from '@heroui/react';
import { type Permission } from '@attraccess/react-query-client';

export interface PermissionPickerProps {
  permissions: Permission[];
  selectedKeys: Set<string>;
  onChange: (keys: Iterable<Key>) => void;
  disabledKeys?: string[];
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  lockedHint?: string;
  lockedTagIndicator?: string;
  permissionLabel: (permission: Permission) => string;
  permissionDescription: (permission: Permission) => string;
  permissionCategory: (category: string) => string;
  dataCy?: string;
  searchDataCy?: string;
  itemDataCy?: (permissionKey: string) => string;
  isDisabled?: boolean;
  presentation?: 'autocomplete' | 'drawer';
  drawerTitle?: string;
  drawerDescription?: string;
  drawerApplyLabel?: string;
  drawerCancelLabel?: string;
  drawerSelectedCount?: (selected: number, total: number) => string;
  drawerPreviewLabel?: string;
  drawerEmptyPreview?: string;
  drawerEditLabel?: string;
  drawerSelectCategoryLabel?: string;
  drawerClearCategoryLabel?: string;
}
