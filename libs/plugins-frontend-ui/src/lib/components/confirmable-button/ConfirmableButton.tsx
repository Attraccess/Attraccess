// Button that asks for confirmation in a StatusDialog before it runs its action
// FEATURE: one confirmation pattern for destructive and irreversible actions in core and plugins
import { ReactNode, use, useState } from 'react';
import { Button, ButtonProps } from '../button';
import { ConfirmDialog } from './ConfirmDialog';
import { ConfirmableConfirmOptions, ConfirmableHostContext, ConfirmableStatus } from './ConfirmableHostContext';

export interface ConfirmableActivatorProps {
  label: ReactNode;
  icon?: ReactNode;
  status: ConfirmableStatus;
  isDisabled?: boolean;
  isPending?: boolean;
  'data-cy'?: string;
}

export interface ConfirmableButtonProps {
  /** Label of the activator; also the confirm button's label unless `confirm.confirmLabel` is set. */
  label: ReactNode;
  icon?: ReactNode;
  /**
   * The confirmed action. The dialog closes when it resolves and stays open when it throws, leaving the
   * error to the caller (usually a toast).
   */
  onConfirm: () => unknown;
  /** Dialog status; only `error` gets a danger confirm button and a danger default activator. */
  status: ConfirmableStatus;
  confirm: ConfirmableConfirmOptions;
  isPending?: boolean;
  isDisabled?: boolean;
  'data-cy'?: string;
  /** Styling of the default activator button. */
  buttonProps?: Omit<ButtonProps, 'onPress' | 'children' | 'isDisabled' | 'isPending'>;
  /**
   * Replaces the default button, e.g. with a dropdown menu item. An activator that unmounts when used
   * (a menu item) must sit inside a `ConfirmableHost`, which keeps the dialog mounted.
   */
  renderActivator?: (open: () => void, props: ConfirmableActivatorProps) => ReactNode;
}

export function ConfirmableButton(props: Readonly<ConfirmableButtonProps>) {
  const { label, icon, onConfirm, status, confirm, isPending, isDisabled, buttonProps, renderActivator } = props;
  const host = use(ConfirmableHostContext);
  const [isOpen, setIsOpen] = useState(false);
  const request = { status, label, confirm, onConfirm, isPending };
  const open = () => (host ? host(request) : setIsOpen(true));
  const activatorProps: ConfirmableActivatorProps = {
    label,
    icon,
    status,
    isDisabled,
    isPending,
    'data-cy': props['data-cy'],
  };

  return (
    <>
      {renderActivator ? (
        renderActivator(open, activatorProps)
      ) : (
        <Button
          variant={status === 'error' ? 'danger' : 'secondary'}
          {...buttonProps}
          onPress={open}
          isDisabled={isDisabled}
          isPending={isPending}
          data-cy={props['data-cy']}
        >
          {icon}
          {label}
        </Button>
      )}
      {!host && <ConfirmDialog request={request} isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
