import { Button, Form, ModalBody, ModalFooter, ModalHeader, ModalHeading, Spinner } from '@heroui/react';
import { StandardModal, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { FindStep, PairingResult, ReaderStep, errorText } from './PairingSteps';
import { PairingFlow, PairingFlowProps, usePairingFlow } from './usePairingFlow';

const FORM_ID = 'attractap-pairing-form';

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
  // A reader that answers late can still be approved, so only a reader that never showed up ends here.
  if (flow.finished || (flow.noResponse && !flow.activeId)) {
    return <Button onPress={onClose}>{t('dialog.close')}</Button>;
  }
  return (
    <>
      <Button variant="ghost" onPress={onClose}>
        {t('dialog.cancel')}
      </Button>
      {flow.needsCodeToFind && (
        <Button
          type="submit"
          form={FORM_ID}
          isDisabled={!flow.canFind}
          isPending={flow.resolvePending}
          data-cy="attractap-pairing-find"
        >
          {t('dialog.find')}
        </Button>
      )}
      {flow.current && (
        <Button
          type="submit"
          form={FORM_ID}
          isDisabled={!flow.canApprove}
          isPending={flow.approvePending}
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
      <ModalBody>
        {/* Enter looks the reader up or approves it, the same as the button in the footer. */}
        <Form
          id={FORM_ID}
          className="flex flex-col gap-4"
          data-cy="attractap-pairing-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            flow.submitForm();
          }}
        >
          {insecure && (
            <StatusAlert status="warning" data-cy="attractap-pairing-insecure-warning">
              {t('dialog.insecureWarning')}
            </StatusAlert>
          )}
          {flow.pollingFailed && (
            <StatusAlert status="danger" data-cy="attractap-pairing-connection-lost">
              {t('dialog.connectionLost')}
            </StatusAlert>
          )}
          {flow.waitingForReader && (
            <div className="flex items-center justify-center gap-3" data-cy="attractap-pairing-waiting">
              <Spinner size="sm" />
              <span>{t('dialog.waitingForReader')}</span>
            </div>
          )}
          {flow.noResponse && !flow.activeId && (
            <StatusAlert status="danger" data-cy="attractap-pairing-no-response">
              {t('dialog.noResponse')}
            </StatusAlert>
          )}
          {flow.needsCodeToFind && (
            <FindStep flow={flow} insecure={insecure} presetTargetReaderId={props.presetTargetReaderId} />
          )}
          {current && !flow.finished && <ReaderStep flow={flow} current={current} insecure={insecure} />}
          {flow.notice && (
            <StatusAlert status="warning" data-cy="attractap-pairing-notice">
              {flow.notice}
            </StatusAlert>
          )}
          {flow.error && (
            <StatusAlert status="danger" data-cy="attractap-pairing-error">
              {errorText(t, flow.error)}
            </StatusAlert>
          )}
          {flow.finished && current && <PairingResult flow={flow} current={current} />}
          {/* Enter submits through this button; the flow decides whether that finds or approves. */}
          <button type="submit" hidden />
        </Form>
      </ModalBody>
      <ModalFooter>
        <Footer flow={flow} onClose={props.onClose} />
      </ModalFooter>
    </>
  );
}
