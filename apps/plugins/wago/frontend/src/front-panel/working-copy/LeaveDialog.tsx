import { StatusDialog } from '@attraccess/plugins-frontend-ui';
import type { useFrontPanelState } from './useFrontPanelState';
type Props = Pick<ReturnType<typeof useFrontPanelState>, 'leave' | 'setLeave' | 't'>;
export function FrontPanelLeaveDialog({ leave, setLeave, t }: Props) {
  return (
    <StatusDialog
      isOpen={Boolean(leave)}
      onClose={() => setLeave(null)}
      status="warning"
      title={t('panel.leaveTitle')}
      closeLabel={t('panel.cancel')}
      action={{ label: t('panel.leave'), onPress: () => leave?.() }}
    >
      {t('panel.leaveHint')}
    </StatusDialog>
  );
}
