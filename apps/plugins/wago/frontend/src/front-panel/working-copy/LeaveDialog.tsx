import { Modal, Button } from '@heroui/react';
import type { useFrontPanelState } from './useFrontPanelState';
type Props = Pick<ReturnType<typeof useFrontPanelState>, 'leave' | 'setLeave' | 't'>;
export function FrontPanelLeaveDialog({ leave, setLeave, t }: Props) {
  return (
    <Modal.Backdrop isOpen={Boolean(leave)} onOpenChange={(open) => !open && setLeave(null)}>
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>{t('panel.leaveTitle')}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>{t('panel.leaveHint')}</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onPress={() => setLeave(null)}>
              {t('panel.cancel')}
            </Button>
            <Button onPress={() => leave?.()}>{t('panel.leave')}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
