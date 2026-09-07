import {
  Modal,
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
 * Per-modal overrides pass through: `size` and `containerProps` reach the
 * ModalContainer, `dialogProps` reach the ModalDialog, and any remaining props
 * (isOpen, onOpenChange, data-cy, …) reach the Modal root.
 */
export function StandardModal(props: Props) {
  const { children, size, backdropProps, containerProps, dialogProps, ...modalProps } = props;

  const mergedDialogClassName = dialogProps?.className
    ? `${DEFAULT_DIALOG_CLASSNAME} ${dialogProps.className}`
    : DEFAULT_DIALOG_CLASSNAME;

  return (
    <Modal {...modalProps}>
      <ModalBackdrop {...backdropProps}>
        <ModalContainer size={size} {...containerProps}>
          <ModalDialog {...dialogProps} className={mergedDialogClassName}>
            {children}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
