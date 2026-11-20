import {
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  type ModalProps,
  type ModalBackdropProps,
  type ModalContainerProps,
  type ModalDialogProps,
} from '@heroui/react';

interface Props extends Omit<ModalProps, 'children'> {
  children: ModalDialogProps['children'];
  /** Forwarded to ModalContainer (sm | md | lg | full, …). */
  size?: ModalContainerProps['size'];
  backdropProps?: Omit<ModalBackdropProps, 'children'>;
  containerProps?: Omit<ModalContainerProps, 'children'>;
  dialogProps?: Omit<ModalDialogProps, 'children'>;
}

const DEFAULT_DIALOG_CLASSNAME = 'bg-overlay';

/**
 * Single source of truth for modal chrome. Wraps HeroUI's Modal primitives and
 * uses the shared overlay and field tokens, like StandardDrawer.
 *
 * Like StandardDrawer it renders no Modal root: that root is a trigger wrapper and
 * React Aria warns ("PressResponder rendered without a pressable child") when it
 * holds no trigger. The root props (isOpen, onOpenChange, defaultOpen, data-cy, …)
 * go to the ModalBackdrop instead, and backdropProps override them. A `state`
 * sets isOpen and gets every open change, as does onOpenChange.
 * `size` and `containerProps` reach the ModalContainer, `dialogProps` the ModalDialog.
 * Render ModalHeading for the accessible title, or provide dialogProps['aria-label']
 * when the content has no title heading. ModalHeader alone does not name the dialog.
 */
export function StandardModal(props: Props) {
  const { children, size, backdropProps, containerProps, dialogProps, state, ...rootProps } = props;
  const stateProps = state
    ? {
        isOpen: state.isOpen,
        onOpenChange: (isOpen: boolean) => {
          state.setOpen(isOpen);
          rootProps.onOpenChange?.(isOpen);
        },
      }
    : {};

  const mergedDialogClassName = dialogProps?.className
    ? `${DEFAULT_DIALOG_CLASSNAME} ${dialogProps.className}`
    : DEFAULT_DIALOG_CLASSNAME;

  return (
    <ModalBackdrop {...rootProps} {...stateProps} {...backdropProps}>
      <ModalContainer size={size} {...containerProps}>
        <ModalDialog {...dialogProps} className={mergedDialogClassName}>
          {children}
        </ModalDialog>
      </ModalContainer>
    </ModalBackdrop>
  );
}
