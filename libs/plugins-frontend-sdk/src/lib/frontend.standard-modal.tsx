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

// Each plugin bundles its own self-contained, prefixed Tailwind CSS (see
// docs/en/plugins/developing-plugins.md), so a Tailwind utility class here
// would only be generated for whichever plugin's build happens to scan this
// file — not reliably for all of them. `--overlay` is a plain CSS custom
// property set globally on `:root`/`.dark` by the host, so an inline style
// works identically everywhere without touching any plugin's build config.
const DEFAULT_DIALOG_STYLE = { backgroundColor: 'var(--overlay)' };

/**
 * Single source of truth for modal chrome, shared by the host app and
 * plugins (module federation shares `@heroui/react` primitives, not host
 * components — see apps/frontend/src/components/standardModal.tsx for the
 * host's own copy). Wraps HeroUI's Modal primitives with the shared overlay
 * token for contrast, like StandardDrawer.
 */
export function StandardModal(props: Props) {
  const { children, size, backdropProps, containerProps, dialogProps, ...modalProps } = props;

  const mergedDialogStyle = { ...DEFAULT_DIALOG_STYLE, ...dialogProps?.style };

  return (
    <Modal {...modalProps}>
      <ModalBackdrop {...backdropProps}>
        <ModalContainer size={size} {...containerProps}>
          <ModalDialog {...dialogProps} style={mergedDialogStyle}>
            {children}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
