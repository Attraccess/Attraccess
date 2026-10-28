// Shared dialog for short status messages and confirmations: info, success, warning, error
// FEATURE: one dialog design for results, failures and confirmations across the app
import { ReactNode } from 'react';
import { AlertDialog } from '@heroui/react';
import { useTranslations } from '../../i18n';
import { Button } from '../button';
import en from './en.json';
import de from './de.json';

export type StatusDialogStatus = 'default' | 'info' | 'success' | 'warning' | 'error';

const ICON_STATUS = {
  default: 'default',
  info: 'accent',
  success: 'success',
  warning: 'warning',
  error: 'danger',
} as const;

export interface StatusDialogAction {
  label: ReactNode;
  onPress: () => unknown;
  isPending?: boolean;
  isDisabled?: boolean;
  'data-cy'?: string;
}

interface StatusDialogProps {
  isOpen: boolean;
  /** Called when the dialog is dismissed (close button or Escape). A backdrop click does nothing. */
  onClose: () => void;
  status: StatusDialogStatus;
  title: ReactNode;
  /** The message; plain text or richer content such as an error log. */
  children?: ReactNode;
  /**
   * Optional primary action (confirm, retry, …). It is styled as destructive for errors only
   * and does not close the dialog by itself.
   */
  action?: StatusDialogAction;
  /** Label of the dismiss button; defaults to "Close", or "Cancel" next to an action. */
  closeLabel?: ReactNode;
  /** Defaults to `<data-cy>-close`. */
  closeDataCy?: string;
  'data-cy'?: string;
}

export function StatusDialog(props: Readonly<StatusDialogProps>) {
  const { isOpen, onClose, status, title, children, action, closeLabel, closeDataCy, 'data-cy': dataCy } = props;
  const { t } = useTranslations({ en, de });
  const isDestructive = status === 'error';

  return (
    <AlertDialog.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      isDismissable={false}
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[440px]" data-cy={dataCy}>
          <AlertDialog.Header>
            <AlertDialog.Icon status={ICON_STATUS[status]} />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          {children !== undefined && (
            <AlertDialog.Body>{typeof children === 'string' ? <p>{children}</p> : children}</AlertDialog.Body>
          )}
          <AlertDialog.Footer>
            <Button
              variant={action ? 'tertiary' : 'primary'}
              onPress={onClose}
              isDisabled={action?.isPending}
              data-cy={closeDataCy ?? (dataCy ? `${dataCy}-close` : undefined)}
            >
              {closeLabel ?? (action ? t('cancel') : t('close'))}
            </Button>
            {action && (
              <Button
                variant={isDestructive ? 'danger' : 'primary'}
                onPress={() => void action.onPress()}
                isPending={action.isPending}
                isDisabled={action.isDisabled}
                data-cy={action['data-cy']}
              >
                {action.label}
              </Button>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
