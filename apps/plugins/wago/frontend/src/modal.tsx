import { Modal, ModalBackdrop, ModalContainer, ModalDialog, type ModalContainerProps, type ModalDialogProps } from '@heroui/react';

const MODAL_DIALOG_CLASSNAME = 'wg:bg-overlay';

// Plugins mirror the host modal because module federation shares primitives, not host components.
export function StandardModal({
  isOpen,
  onOpenChange,
  children,
  size,
  ariaLabel,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ModalDialogProps['children'];
  size?: ModalContainerProps['size'];
  ariaLabel?: string;
}) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalBackdrop>
        <ModalContainer size={size}>
          <ModalDialog aria-label={ariaLabel} className={MODAL_DIALOG_CLASSNAME}>
            {children}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
