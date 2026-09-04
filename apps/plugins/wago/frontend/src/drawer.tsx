import type { CSSProperties, ReactNode } from 'react';
import { DrawerBackdrop, DrawerContent, DrawerDialog } from '@heroui/react';

const DRAWER_DIALOG_CLASSNAME = 'wg:md:mx-auto wg:md:max-w-2xl wg:bg-surface-secondary';
const FIELD_CONTRAST_STYLE: CSSProperties = {
  ['--field-border' as never]: 'var(--border-secondary)',
  ['--border-width-field' as never]: '1px',
};

// Plugins mirror the host drawer because module federation shares primitives, not host components.
export function StandardDrawer({
  isOpen,
  onOpenChange,
  children,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <DrawerBackdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerDialog className={DRAWER_DIALOG_CLASSNAME} style={FIELD_CONTRAST_STYLE}>
          {children}
        </DrawerDialog>
      </DrawerContent>
    </DrawerBackdrop>
  );
}
