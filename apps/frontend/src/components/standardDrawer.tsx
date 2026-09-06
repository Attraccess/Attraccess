import type { ReactNode } from 'react';
import {
  DrawerBackdrop,
  DrawerContent,
  DrawerDialog,
  type DrawerBackdropProps,
  type DrawerContentProps,
  type DrawerDialogProps,
} from '@heroui/react';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  backdropProps?: Omit<DrawerBackdropProps, 'children' | 'isOpen' | 'onOpenChange'>;
  contentProps?: Omit<DrawerContentProps, 'children'>;
  dialogProps?: Omit<DrawerDialogProps, 'children'>;
}

const DEFAULT_DIALOG_CLASSNAME = 'md:max-w-2xl md:mx-auto bg-overlay';

export function StandardDrawer(props: Props) {
  const { isOpen, onOpenChange, children, backdropProps, contentProps, dialogProps } = props;

  const mergedDialogClassName = dialogProps?.className
    ? `${DEFAULT_DIALOG_CLASSNAME} ${dialogProps.className}`
    : DEFAULT_DIALOG_CLASSNAME;

  return (
    <DrawerBackdrop {...backdropProps} isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerContent {...contentProps}>
        <DrawerDialog {...dialogProps} className={mergedDialogClassName}>
          {children}
        </DrawerDialog>
      </DrawerContent>
    </DrawerBackdrop>
  );
}
