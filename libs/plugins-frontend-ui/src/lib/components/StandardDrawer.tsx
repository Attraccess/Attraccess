import { ReactNode } from 'react';
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

const DEFAULT_DIALOG_CLASSNAME = 'md:max-w-2xl bg-overlay';
// A bottom drawer is centred on wide screens; a side drawer stays docked to its edge.
const CENTERED_DIALOG_CLASSNAME = `${DEFAULT_DIALOG_CLASSNAME} md:mx-auto`;

/** Render DrawerHeading for the title, or name headerless content via dialogProps['aria-label']. */
export function StandardDrawer(props: Props) {
  const { isOpen, onOpenChange, children, backdropProps, contentProps, dialogProps } = props;

  const isSideDrawer = contentProps?.placement === 'left' || contentProps?.placement === 'right';
  const baseClassName = isSideDrawer ? DEFAULT_DIALOG_CLASSNAME : CENTERED_DIALOG_CLASSNAME;
  const mergedDialogClassName = dialogProps?.className ? `${baseClassName} ${dialogProps.className}` : baseClassName;

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
