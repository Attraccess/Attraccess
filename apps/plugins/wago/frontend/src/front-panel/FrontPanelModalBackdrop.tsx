import { Button, Modal } from '@heroui/react';
import { DIGITAL_TERMINALS } from '../../../backend/configuration/digital';
import { useFrontPanelState } from './useFrontPanelState';
type Props = Pick<ReturnType<typeof useFrontPanelState>, 'panel' | 't'>;
export function FrontPanelModalBackdrop({ panel, t }: Props) {
  return (
    <Modal.Backdrop isOpen={Boolean(panel.review)} onOpenChange={(open) => !open && panel.cancelReview()}>
      <Modal.Container>
        <Modal.Dialog>
          <Modal.Header>
            <Modal.Heading>{t('panel.applyTitle')}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p>{t('panel.applyHint')}</p>
            <ul className="wg:mt-3 wg:flex wg:flex-col wg:gap-2">
              {panel.applied?.snapshot.logicalChannels
                .filter((channel) => channel.capabilities.includes('output'))
                .map((channel) => {
                  const point = panel.applied?.snapshot.physicalPoints.find(
                    (item) => item.id === channel.physicalPointId,
                  );
                  const terminal =
                    point?.hardwareProfile === '751-9301'
                      ? DIGITAL_TERMINALS.find((item) => item.direction === 'output' && item.channel === point.channel)
                      : undefined;
                  const sample = panel.live.enabled
                    ? panel.diagnostics.data?.channels
                        .find((item) => item.id === channel.id)
                        ?.samples.find(
                          (item) => item.kind === 'output' && item.current && typeof item.value === 'boolean',
                        )
                    : undefined;
                  return (
                    <li key={channel.id}>
                      {terminal && `${terminal.label} · `}
                      {panel.applied?.metadata.names[channel.id] ?? channel.id}:{' '}
                      <strong>{sample ? (sample.value ? t('panel.high') : t('panel.low')) : t('panel.unknown')}</strong>
                    </li>
                  );
                })}
            </ul>
            {!panel.applied?.snapshot.logicalChannels.some((channel) => channel.capabilities.includes('output')) && (
              <p>{t('panel.noAppliedOutputs')}</p>
            )}
            {Boolean(panel.review?.impacts.length) && (
              <>
                <p className="wg:mt-3">{t('panel.flowImpactHint', { count: panel.review?.impacts.length ?? 0 })}</p>
                <ul className="wg:mt-3 wg:flex wg:flex-col wg:gap-2">
                  {panel.review?.impacts.map((impact) => (
                    <li key={impact.channelId}>
                      {panel.configuration?.metadata.names[impact.channelId] ?? impact.channelId} ·{' '}
                      {t('panel.flowReferences', { count: impact.references.length })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" isDisabled={panel.busy} onPress={panel.cancelReview}>
              {t('panel.cancel')}
            </Button>
            <Button isDisabled={panel.busy} onPress={panel.confirmApply}>
              {t('panel.apply')}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
