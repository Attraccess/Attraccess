import { Button, StandardModal, StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Checkbox, ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useState } from 'react';
import { useMatterTranslations } from '../i18n';
import { saveBlob, type RecoveryKeyReveal } from './api';

type Props = Readonly<{
  reveal: RecoveryKeyReveal;
  /** Records the acknowledgement; the modal stays open if it rejects. */
  onAcknowledge: (keyId: string) => Promise<void>;
  /** The parent drops the key from its state here. */
  onDone: () => void;
}>;

/**
 * The one and only place the recovery key is visible. It cannot be dismissed (no close button, no Escape, no
 * backdrop click) until the administrator confirms they stored the key; only then is the key forgotten.
 */
export function RecoveryKeyModal({ reveal, onAcknowledge, onDone }: Props) {
  const { t } = useMatterTranslations();
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reveal.key);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(t('fabric.key.copyFailed'));
    }
  };

  const download = () => {
    const text = `${t('fabric.key.fileHeader')}\n\n${t('fabric.key.keyId')}: ${reveal.keyId}\n${t('fabric.key.created')}: ${reveal.createdAt}\n\n${reveal.key}\n`;
    saveBlob(new Blob([text], { type: 'text/plain' }), `attraccess-matter-recovery-key-${reveal.keyId}.txt`);
  };

  const done = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAcknowledge(reveal.keyId);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StandardModal
      isOpen
      data-cy="matter-key-modal"
      onOpenChange={() => undefined}
      size="md"
      backdropProps={{ isDismissable: false, isKeyboardDismissDisabled: true }}
    >
      <ModalHeader>
        <ModalHeading>{t('fabric.key.title')}</ModalHeading>
      </ModalHeader>
      <ModalBody className="mt:flex mt:flex-col mt:gap-4">
        <StatusAlert status="warning" title={t('fabric.key.warningTitle')}>
          {t('fabric.key.warning')}
        </StatusAlert>
        <code
          className="mt:block mt:break-all mt:rounded-lg mt:bg-surface-secondary mt:p-3 mt:text-center mt:font-mono mt:text-base mt:select-all"
          data-cy="matter-key-value"
        >
          {reveal.key}
        </code>
        <p className="mt:text-xs mt:text-muted">
          {t('fabric.key.keyId')}: {reveal.keyId}
        </p>
        <div className="mt:flex mt:flex-wrap mt:gap-2">
          <Button variant="secondary" onPress={() => void copy()} data-cy="matter-key-copy">
            {copied ? t('fabric.key.copied') : t('fabric.key.copy')}
          </Button>
          <Button variant="secondary" onPress={download} data-cy="matter-key-download">
            {t('fabric.key.download')}
          </Button>
        </div>
        <Checkbox isSelected={confirmed} onChange={setConfirmed} data-cy="matter-key-ack">
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            {t('fabric.key.acknowledge')}
          </Checkbox.Content>
        </Checkbox>
        {error && <StatusAlert status="danger">{error}</StatusAlert>}
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={!confirmed} isPending={busy} onPress={() => void done()} data-cy="matter-key-done">
          {t('fabric.key.done')}
        </Button>
      </ModalFooter>
    </StandardModal>
  );
}
