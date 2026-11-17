import { StandardDrawer } from '@attraccess/plugins-frontend-ui';
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
} from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Key } from '@heroui/react';
import type { Permission } from '@attraccess/react-query-client';
import { CategoryIcon } from './CategoryIcon';

interface PermissionDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  permissionsByCategory: { category: string; permissions: Permission[] }[];
  selectedKeys: Set<string>;
  disabledKeys: string[];
  onChange: (keys: Iterable<Key>) => void;
  label: string;
  drawerTitle?: string;
  drawerDescription?: string;
  drawerApplyLabel?: string;
  drawerCancelLabel?: string;
  drawerSelectCategoryLabel?: string;
  drawerClearCategoryLabel?: string;
  itemDataCy?: (permissionKey: string) => string;
  permissionLabel: (permission: Permission) => string;
  permissionDescription: (permission: Permission) => string;
  permissionCategory: (category: string) => string;
}

/** Edits a draft of the selection by category; Apply hands the draft to onChange, Cancel drops it. */
export function PermissionDrawer({
  isOpen,
  onOpenChange,
  permissionsByCategory,
  selectedKeys,
  disabledKeys,
  onChange,
  label,
  drawerTitle,
  drawerDescription,
  drawerApplyLabel,
  drawerCancelLabel,
  drawerSelectCategoryLabel,
  drawerClearCategoryLabel,
  itemDataCy,
  permissionLabel,
  permissionDescription,
  permissionCategory,
}: Readonly<PermissionDrawerProps>) {
  const [draftKeys, setDraftKeys] = useState<Set<string>>(() => new Set(selectedKeys));

  useEffect(() => {
    if (isOpen) setDraftKeys(new Set(selectedKeys));
  }, [isOpen, selectedKeys]);

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

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange}>
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
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {drawerCancelLabel}
        </Button>
        <Button
          variant="primary"
          onPress={() => {
            onChange(draftKeys);
            onOpenChange(false);
          }}
        >
          {drawerApplyLabel}
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
