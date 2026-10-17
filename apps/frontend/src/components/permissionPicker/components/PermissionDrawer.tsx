import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Checkbox,
  Description,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeading,
  useFilter,
} from '@heroui/react';
import { LockIcon, CreditCard, Database, Settings, ShieldCheck, UsersRound } from 'lucide-react';
import { StandardDrawer } from '../../standardDrawer';
import { useEffect, useMemo, useState } from 'react';
import type { Key } from '@heroui/react';
import type { Permission } from '@attraccess/react-query-client';

export function CategoryIcon({ category }: { category: string }) {
  const Icon =
    category === 'resources'
      ? Database
      : category === 'users'
        ? UsersRound
        : category === 'system'
          ? Settings
          : category === 'billing'
            ? CreditCard
            : ShieldCheck;

  return <Icon className="size-4 shrink-0 text-default-500" aria-hidden="true" />;
}

export const CATEGORY_ORDER = ['resources', 'users', 'system', 'billing'];

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

type Props = Pick<
  ReturnType<typeof usePermissionPickerState>,
  | 'isDrawerOpen'
  | 'setIsDrawerOpen'
  | 'drawerTitle'
  | 'label'
  | 'drawerDescription'
  | 'permissionsByCategory'
  | 'disabledKeys'
  | 'draftKeys'
  | 'permissionCategory'
  | 'updateCategory'
  | 'drawerClearCategoryLabel'
  | 'drawerSelectCategoryLabel'
  | 'updateDraft'
  | 'itemDataCy'
  | 'permissionLabel'
  | 'permissionDescription'
  | 'drawerCancelLabel'
  | 'onChange'
  | 'drawerApplyLabel'
>;

export function PermissionDrawer({
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
}: Props) {
  return (
    <StandardDrawer isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <DrawerHeader className="flex flex-col gap-1">
        <DrawerHeading className="text-lg font-semibold">{drawerTitle ?? label}</DrawerHeading>
        {drawerDescription ? <p className="text-sm text-default-500">{drawerDescription}</p> : null}
      </DrawerHeader>
      <DrawerBody>
        <Accordion aria-label={label} className="w-full" variant="surface" allowsMultipleExpanded>
          {permissionsByCategory.map(({ category, permissions: categoryPermissions }) => {
            const selectablePermissions = categoryPermissions.filter(
              (permission) => !disabledKeys.includes(permission.key),
            );
            const selectedInCategory = categoryPermissions.filter((permission) => draftKeys.has(permission.key)).length;
            const isCategorySelected =
              selectablePermissions.length > 0 &&
              selectablePermissions.every((permission) => draftKeys.has(permission.key));

            return (
              <AccordionItem key={category} id={category} aria-label={permissionCategory(category)}>
                <AccordionHeading>
                  <AccordionTrigger className="gap-3">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <CategoryIcon category={category} />
                        <span>{permissionCategory(category)}</span>
                      </span>
                      <span className="shrink-0 text-sm font-normal tabular-nums text-default-500">
                        {selectedInCategory}/{categoryPermissions.length}
                      </span>
                    </span>
                    <AccordionIndicator />
                  </AccordionTrigger>
                </AccordionHeading>
                <AccordionPanel>
                  <AccordionBody className="flex flex-col gap-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => updateCategory(categoryPermissions, !isCategorySelected)}
                        isDisabled={selectablePermissions.length === 0}
                      >
                        {isCategorySelected ? drawerClearCategoryLabel : drawerSelectCategoryLabel}
                      </Button>
                    </div>
                    <div className="flex flex-col gap-3">
                      {categoryPermissions.map((permission) => {
                        const isLocked = disabledKeys.includes(permission.key);
                        return (
                          <Checkbox
                            key={permission.key}
                            isSelected={draftKeys.has(permission.key)}
                            onChange={(isSelected) => updateDraft(permission.key, isSelected)}
                            isDisabled={isLocked}
                            data-cy={itemDataCy?.(permission.key)}
                          >
                            <Checkbox.Content className="items-start">
                              <Checkbox.Control className="mt-0.5">
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <span className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1">
                                  {permissionLabel(permission)}
                                  {isLocked ? (
                                    <LockIcon className="h-3.5 w-3.5 text-default-400" aria-hidden="true" />
                                  ) : null}
                                </span>
                                <Description>{permissionDescription(permission)}</Description>
                              </span>
                            </Checkbox.Content>
                          </Checkbox>
                        );
                      })}
                    </div>
                  </AccordionBody>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={() => setIsDrawerOpen(false)}>
          {drawerCancelLabel}
        </Button>
        <Button
          variant="primary"
          onPress={() => {
            onChange(draftKeys);
            setIsDrawerOpen(false);
          }}
        >
          {drawerApplyLabel}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
