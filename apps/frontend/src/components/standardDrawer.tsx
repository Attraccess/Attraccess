import type { ReactNode } from 'react';
import {
  Drawer,
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
  backdropProps?: Omit<DrawerBackdropProps, 'children'>;
  contentProps?: Omit<DrawerContentProps, 'children'>;
  dialogProps?: Omit<DrawerDialogProps, 'children'>;
}

export function StandardDrawer(props: Props) {
  const { isOpen, onOpenChange, children, backdropProps, contentProps, dialogProps } = props;

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange}>
      <DrawerBackdrop {...backdropProps} />
      <DrawerContent {...contentProps}>
        <DrawerDialog {...dialogProps}>{children}</DrawerDialog>
      </DrawerContent>
    </Drawer>
  );
}
