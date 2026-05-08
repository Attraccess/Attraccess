import {
  Modal as V3Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  useOverlayState,
  type UseOverlayStateProps,
} from '@heroui/react';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

export interface UseDisclosureReturn {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onToggle: () => void;
}

export function useDisclosure(props?: UseOverlayStateProps): UseDisclosureReturn {
  const state = useOverlayState(props);
  return {
    isOpen: state.isOpen,
    onOpen: state.open,
    onClose: state.close,
    onOpenChange: state.setOpen,
    onToggle: state.toggle,
  };
}

const ModalCloseContext = createContext<() => void>(() => undefined);

type V3ContainerProps = ComponentProps<typeof ModalContainer>;
type V3BackdropProps = ComponentProps<typeof ModalBackdrop>;
type V3RootProps = ComponentProps<typeof V3Modal>;

export interface ModalProps
  extends Omit<V3RootProps, 'children'>,
    Pick<V3ContainerProps, 'size' | 'placement' | 'scroll'>,
    Pick<V3BackdropProps, 'isDismissable' | 'variant'> {
  children?: ReactNode;
  backdrop?: V3BackdropProps['variant'];
  hideCloseButton?: boolean;
}

export function Modal({
  size,
  placement,
  scroll,
  isDismissable,
  variant,
  backdrop,
  hideCloseButton,
  children,
  ...rest
}: ModalProps) {
  return (
    <V3Modal {...rest}>
      <ModalBackdrop isDismissable={isDismissable} variant={backdrop ?? variant} />
      <ModalContainer size={size} placement={placement} scroll={scroll}>
        <ModalDialog>
          {(close: () => void) => (
            <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
          )}
        </ModalDialog>
      </ModalContainer>
    </V3Modal>
  );
}

export interface ModalContentProps {
  children?: ReactNode | ((onClose: () => void) => ReactNode);
}

export function ModalContent({ children }: ModalContentProps) {
  const onClose = useContext(ModalCloseContext);
  return <>{typeof children === 'function' ? children(onClose) : children}</>;
}

export { ModalBody, ModalFooter, ModalHeader } from '@heroui/react';
