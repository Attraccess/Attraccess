// Confirm dialog behind ConfirmableButton: runs the action and closes only once it succeeded
// FEATURE: one confirmation flow for destructive and irreversible actions
import { useState } from 'react';
import { StatusDialog } from '../status-dialog';
import type { ConfirmableRequest } from './ConfirmableHostContext';

interface ConfirmDialogProps {
  /** The confirmation to show; undefined closes the dialog. */
  request: ConfirmableRequest | undefined;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * While `onConfirm` runs, the dialog stays open, its confirm button shows pending and Cancel is disabled.
 * It closes when `onConfirm` resolves. When `onConfirm` throws or rejects, it stays open so the user can
 * retry or cancel; reporting the error (usually a toast) is up to the caller.
 */
export function ConfirmDialog({ request, isOpen, onClose }: Readonly<ConfirmDialogProps>) {
  const [isRunning, setIsRunning] = useState(false);
  if (!request) return null;
  const { status, confirm, label, onConfirm, isPending } = request;

  const run = async () => {
    setIsRunning(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Stays open; the caller reports the error.
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <StatusDialog
      isOpen={isOpen}
      onClose={onClose}
      status={status}
      title={confirm.title}
      closeLabel={confirm.cancelLabel}
      closeDataCy={confirm.cancelDataCy}
      action={{
        label: confirm.confirmLabel ?? label,
        onPress: run,
        isPending: isRunning || isPending,
        'data-cy': confirm.confirmDataCy,
      }}
      data-cy={confirm['data-cy']}
    >
      {confirm.message}
    </StatusDialog>
  );
}
