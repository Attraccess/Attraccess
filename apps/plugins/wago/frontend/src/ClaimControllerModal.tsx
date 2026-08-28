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
import { useState } from 'react';
import { useClaimControllerMutation } from './queries';

interface ClaimControllerModalProps {
  controllerId: number | null;
  onOpenChange: (isOpen: boolean) => void;
}

export function ClaimControllerModal({ controllerId, onOpenChange }: ClaimControllerModalProps) {
  const claimMutation = useClaimControllerMutation();
  const [name, setName] = useState('');
  const [verifier, setVerifier] = useState('');

  function close() {
    setName('');
    setVerifier('');
    claimMutation.reset();
    onOpenChange(false);
  }

  function submitClaim() {
    if (controllerId === null) return;

    claimMutation.mutate({ id: controllerId, input: { name, verifier } }, { onSuccess: close });
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
              <ModalHeading>Claim controller</ModalHeading>
            </ModalHeader>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                submitClaim();
              }}
            >
              <ModalBody>
                <p className="wg:text-sm wg:text-muted">
                  Verify physical access to this controller before it can receive commands.
                </p>
                <TextField isRequired name="name">
                  <Label>Controller name</Label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} />
                </TextField>
                <TextField isRequired name="verifier">
                  <Label>Physical pairing code or fingerprint</Label>
                  <Input value={verifier} onChange={(event) => setVerifier(event.target.value)} />
                </TextField>
                {claimMutation.isError && (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Description>{getErrorMessage(claimMutation.error)}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={close}>
                  Cancel
                </Button>
                <Button type="submit" isPending={claimMutation.isPending}>
                  Verify and claim
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
