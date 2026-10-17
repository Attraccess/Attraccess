import {
  Alert,
  Button,
  Form,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
} from '@heroui/react';
import { useEffectEvent, useState } from 'react';
import { useClaimControllerMutation } from '../api/queries';
import { useWagoTranslations } from '../i18n';

interface ClaimControllerModalProps {
  controllerId: number | null;
  onOpenChange: (isOpen: boolean) => void;
}

export function ClaimControllerModal({ controllerId, onOpenChange }: ClaimControllerModalProps) {
  const { t } = useWagoTranslations();
  const claimMutation = useClaimControllerMutation();
  const [name, setName] = useState('');
  const [verifier, setVerifier] = useState('');

  function close() {
    setName('');
    setVerifier('');
    claimMutation.reset();
    onOpenChange(false);
  }

  const closeClaimedController = useEffectEvent((claimedControllerId: number) => {
    if (controllerId === claimedControllerId) close();
  });

  function submitClaim() {
    if (controllerId === null) return;

    const claimedControllerId = controllerId;
    claimMutation.mutate(
      { id: claimedControllerId, input: { name, verifier } },
      { onSuccess: () => closeClaimedController(claimedControllerId) },
    );
  }

  return (
    <Modal
      isOpen={controllerId !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
    >
      <ModalBackdrop>
        <ModalContainer size="sm">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>{t('claim.title')}</ModalHeading>
            </ModalHeader>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                submitClaim();
              }}
            >
              <ModalBody>
                <p className="wg:text-sm wg:text-muted">{t('claim.description')}</p>
                <TextField isRequired name="name">
                  <Label>{t('claim.name')}</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </TextField>
                <TextField isRequired name="verifier">
                  <Label>{t('claim.verifier')}</Label>
                  <Input value={verifier} onChange={(event) => setVerifier(event.target.value)} />
                </TextField>
                {claimMutation.isError && (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>
                        {claimMutation.error instanceof Error ? claimMutation.error.message : t('common.retry')}
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={close}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" isPending={claimMutation.isPending}>
                  {t('claim.submit')}
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
