import { StandardModal } from '@attraccess/plugins-frontend-ui';
import { MaintenanceCheckContent, type MaintenanceCheckContentProps } from './MaintenanceCheckContent';

interface MaintenanceCheckDialogProps extends MaintenanceCheckContentProps {
  isOpen: boolean;
}

/** "Is the machine OK?", asked before a user ends their own session. "Needs maintenance" asks for the reason. */
export function MaintenanceCheckDialog({ isOpen, ...content }: Readonly<MaintenanceCheckDialogProps>) {
  return (
    <StandardModal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) content.onCancel();
      }}
      size="md"
      data-cy="maintenance-check-dialog"
    >
      {/* Mounted per opening, so every check starts with the question and an empty reason. */}
      <MaintenanceCheckContent {...content} />
    </StandardModal>
  );
}
