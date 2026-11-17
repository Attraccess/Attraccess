import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import { useWagoTranslations } from '../../i18n';

interface FrontPanelLeaveDialogProps {
  /** The navigation waiting for confirmation; null while no unapplied changes block the user. */
  leave: (() => void) | null;
  onCancel: () => void;
}

export function FrontPanelLeaveDialog({ leave, onCancel }: FrontPanelLeaveDialogProps) {
  const { t } = useWagoTranslations();
  return (
    <StatusDialog
      isOpen={Boolean(leave)}
      onClose={onCancel}
      status="warning"
      title={t('panel.leaveTitle')}
      closeLabel={t('panel.cancel')}
      action={{ label: t('panel.leave'), onPress: () => leave?.() }}
    >
      {t('panel.leaveHint')}
    </StatusDialog>
  );
}
