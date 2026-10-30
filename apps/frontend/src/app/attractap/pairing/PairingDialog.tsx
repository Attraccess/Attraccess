import { Button, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import { StandardModal } from '@attraccess/plugins-frontend-ui';
import { FindStep, Notice, PairingResult, ReaderStep, errorText } from './PairingSteps';
import { PairingFlow, PairingFlowProps, usePairingFlow } from './usePairingFlow';

export interface PairingDialogProps extends PairingFlowProps {
  isOpen: boolean;
}

/**
 * The one place a reader is approved: the admin identifies the reader (code or colour pattern), says what
 * it is, and approves. The state of the request is read from the server, never assumed.
 */
export function PairingDialog(props: Readonly<PairingDialogProps>) {
  const { isOpen, onClose } = props;
  return (
    <StandardModal isOpen={isOpen} onOpenChange={(open) => !open && onClose()} size="md">
      {() => <PairingDialogContent {...props} />}
    </StandardModal>
  );
}

function Footer({ flow, onClose }: Readonly<{ flow: PairingFlow; onClose: () => void }>) {
  const { t } = flow;
  if (flow.finished || flow.noResponse) return <Button onPress={onClose}>{t('dialog.close')}</Button>;
  return (
    <>
      <Button variant="ghost" onPress={onClose}>
        {t('dialog.cancel')}
      </Button>
      {flow.needsCodeToFind && (
        <Button
          isDisabled={!flow.normalizedCode}
          isPending={flow.resolvePending}
          onPress={flow.findByCode}
          data-cy="attractap-pairing-find"
        >
          {t('dialog.find')}
        </Button>
      )}
      {flow.current && (
        <Button
          isDisabled={!flow.canApprove}
          isPending={flow.approvePending}
          onPress={flow.submit}
          data-cy="attractap-pairing-approve"
        >
          {t('dialog.approve')}
        </Button>
      )}
    </>
  );
}

function PairingDialogContent(props: Readonly<PairingDialogProps>) {
  const flow = usePairingFlow(props);
  const { t, current } = flow;
  const insecure = typeof window !== 'undefined' && !window.isSecureContext;

  return (
    <>
      <ModalHeader>
        <ModalHeading>{t('dialog.title')}</ModalHeading>
      </ModalHeader>
      <ModalBody className="flex flex-col gap-4" data-cy="attractap-pairing-dialog">
        {insecure && (
          <Notice status="warning" dataCy="attractap-pairing-insecure-warning">
            {t('dialog.insecureWarning')}
          </Notice>
        )}
        {flow.pollingFailed && (
          <Notice status="danger" dataCy="attractap-pairing-connection-lost">
            {t('dialog.connectionLost')}
          </Notice>
        )}
        {flow.waitingForReader && (
          <div className="flex items-center justify-center gap-3" data-cy="attractap-pairing-waiting">
            <Spinner size="sm" />
            <span>{t('dialog.waitingForReader')}</span>
          </div>
        )}
        {flow.noResponse && !flow.activeId && (
          <Notice status="danger" dataCy="attractap-pairing-no-response">
            {t('dialog.noResponse')}
          </Notice>
        )}
        {flow.needsCodeToFind && (
          <FindStep flow={flow} insecure={insecure} presetTargetReaderId={props.presetTargetReaderId} />
        )}
        {current && !flow.finished && <ReaderStep flow={flow} current={current} insecure={insecure} />}
        {flow.notice && (
          <Notice status="warning" dataCy="attractap-pairing-notice">
            {flow.notice}
          </Notice>
        )}
        {flow.error && (
          <Notice status="danger" dataCy="attractap-pairing-error">
            {errorText(t, flow.error)}
          </Notice>
        )}
        {flow.finished && current && <PairingResult flow={flow} current={current} />}
      </ModalBody>
      <ModalFooter>
        <Footer flow={flow} onClose={props.onClose} />
      </ModalFooter>
    </>
  );
}
