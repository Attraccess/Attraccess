import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionBody,
  AccordionHeading,
  AccordionIndicator,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Autocomplete,
  Button,
  Checkbox,
  Description,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  EmptyState,
  Header,
  Label,
  ListBox,
  SearchField,
  Tag,
  TagGroup,
  useFilter,
  type Key,
} from '@heroui/react';
import { CreditCard, Database, KeyRound, LockIcon, Pencil, Settings, ShieldCheck, UsersRound } from 'lucide-react';
import { type Permission } from '@attraccess/react-query-client';
import { StandardDrawer } from '../standardDrawer';

const CATEGORY_ORDER = ['resources', 'users', 'system', 'billing'];

function CategoryIcon({ category }: { category: string }) {
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

interface PermissionPickerProps {
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
  const { contains } = useFilter({ sensitivity: 'base' });
  const permissionByKey = useMemo(() => new Map(permissions.map((permission) => [permission.key, permission])), [permissions]);
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
                  {hiddenPreviewCategoryCount > 0 ? <span className="rounded-small bg-default-100 px-2 py-0.5 text-xs text-default-600">+{hiddenPreviewCategoryCount}</span> : null}
                </span>
              )}
              <span className="text-xs tabular-nums text-default-500">{drawerSelectedCount?.(selectedCount, totalCount) ?? `${selectedCount}/${totalCount}`}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 self-center text-sm font-medium text-primary">
            <span className="hidden xl:inline">{drawerEditLabel ?? placeholder}</span>
            <Pencil className="size-4" aria-hidden="true" />
          </span>
        </Button>

        <StandardDrawer isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerHeader className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{drawerTitle ?? label}</h2>
            {drawerDescription ? <p className="text-sm text-default-500">{drawerDescription}</p> : null}
          </DrawerHeader>
          <DrawerBody>
            <Accordion aria-label={label} className="w-full" variant="surface" allowsMultipleExpanded>
              {permissionsByCategory.map(({ category, permissions: categoryPermissions }) => {
                const selectablePermissions = categoryPermissions.filter((permission) => !disabledKeys.includes(permission.key));
                const selectedInCategory = categoryPermissions.filter((permission) => draftKeys.has(permission.key)).length;
                const isCategorySelected = selectablePermissions.length > 0 && selectablePermissions.every((permission) => draftKeys.has(permission.key));

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
                                      {isLocked ? <LockIcon className="h-3.5 w-3.5 text-default-400" aria-hidden="true" /> : null}
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
      </>
    );
  }

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
                    <Tag key={key} id={key} textValue={isLocked && lockedTagIndicator ? `${permissionName} ${lockedTagIndicator}` : permissionName}>
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
          <SearchField
            autoFocus
            name="permission-search"
            variant="secondary"
          >
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
                    {disabledKeys.includes(permission.key) ? <LockIcon className="w-3.5 h-3.5 text-default-400 shrink-0" /> : null}
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
