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
} from '@heroui/react';
import { LockIcon } from 'lucide-react';
import { StandardDrawer } from '../standardDrawer';
import { CategoryIcon } from './index.category-icon';
import { usePermissionPickerState } from './usePermissionPickerState';
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
export function PermissionPickerStandardDrawer({
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
        <h2 className="text-lg font-semibold">{drawerTitle ?? label}</h2>
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
