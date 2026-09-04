import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Select,
  Spinner,
  TextField,
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { useEffect, useState } from 'react';
import type { CommissioningSession } from './api';
import {
  useCreateCommissioningSessionMutation,
  useDeliverCommissioningSessionMutation,
  useMqttServersQuery,
  useRevokeCommissioningSessionMutation,
  useSettingsQuery,
} from './queries';

interface CommissioningModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function CommissioningModal({ isOpen, onOpenChange }: CommissioningModalProps) {
  const createSessionMutation = useCreateCommissioningSessionMutation();
  const deliverSessionMutation = useDeliverCommissioningSessionMutation();
  const revokeSessionMutation = useRevokeCommissioningSessionMutation();
  const settingsQuery = useSettingsQuery();
  const mqttServersQuery = useMqttServersQuery();
  const [controllerIp, setControllerIp] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [mqttServerId, setMqttServerId] = useState<Key | null>(null);
  const [sshUsername, setSshUsername] = useState('');
  const [sshPassword, setSshPassword] = useState('');
  const [physicalIdentityConfirmed, setPhysicalIdentityConfirmed] = useState(false);
  const [codesysStopAcknowledged, setCodesysStopAcknowledged] = useState(false);
  const [deliveryStartedAt, setDeliveryStartedAt] = useState<number | null>(null);
  const [deliveryElapsedSeconds, setDeliveryElapsedSeconds] = useState(0);

  useEffect(() => {
    if (isOpen) setMqttServerId(settingsQuery.data?.defaultMqttServerId?.toString() ?? null);
  }, [isOpen, settingsQuery.data?.defaultMqttServerId]);

  useEffect(() => {
    if (deliveryStartedAt === null || !deliverSessionMutation.isPending) return;
    const interval = window.setInterval(() => setDeliveryElapsedSeconds(Math.floor((Date.now() - deliveryStartedAt) / 1_000)), 1_000);
    return () => window.clearInterval(interval);
  }, [deliveryStartedAt, deliverSessionMutation.isPending]);

  const session = revokeSessionMutation.data ?? deliverSessionMutation.data ?? createSessionMutation.data;
  const selectedMqttServerId = mqttServerId === null ? null : Number(mqttServerId);

  function close() {
    setControllerIp('');
    setHardwareId('');
    setMqttServerId(null);
    setSshUsername('');
    setSshPassword('');
    setPhysicalIdentityConfirmed(false);
    setCodesysStopAcknowledged(false);
    setDeliveryStartedAt(null);
    setDeliveryElapsedSeconds(0);
    createSessionMutation.reset();
    deliverSessionMutation.reset();
    revokeSessionMutation.reset();
    onOpenChange(false);
  }

  function createSession() {
    if (selectedMqttServerId === null) return;

    createSessionMutation.mutate(
      {
        hardwareId,
        targetHost: controllerIp,
        mqttServerId: selectedMqttServerId,
      },
    );
  }

  function deliverSession(session: CommissioningSession) {
    const temporarySsh = { username: sshUsername, password: sshPassword };
    setSshPassword('');
    setDeliveryStartedAt(Date.now());
    setDeliveryElapsedSeconds(0);
    deliverSessionMutation.mutate({
      id: session.id,
      hostKeyFingerprint: session.hostKeyFingerprint,
      physicalIdentityConfirmed,
      codesysStopConfirmed: codesysStopAcknowledged,
      temporarySsh,
    });
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>{session ? 'Secure commissioning session' : 'Commission WAGO controller'}</ModalHeading>
            </ModalHeader>
            {session ? (
              <SessionStatus
                session={session}
                isDelivering={deliverSessionMutation.isPending}
                deliveryElapsedSeconds={deliveryElapsedSeconds}
                deliveryError={deliverSessionMutation.error}
                isRevoking={revokeSessionMutation.isPending}
                revokeError={revokeSessionMutation.error}
                sshUsername={sshUsername}
                sshPassword={sshPassword}
                physicalIdentityConfirmed={physicalIdentityConfirmed}
                codesysStopAcknowledged={codesysStopAcknowledged}
                onSshUsernameChange={setSshUsername}
                onSshPasswordChange={setSshPassword}
                onPhysicalIdentityConfirmedChange={setPhysicalIdentityConfirmed}
                onCodesysStopAcknowledgedChange={setCodesysStopAcknowledged}
                onDeliver={() => deliverSession(session)}
                onRevoke={() => revokeSessionMutation.mutate(session.id)}
              />
            ) : (
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  createSession();
                }}
              >
                <ModalBody>
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Physical access is required</Alert.Title>
                      <Alert.Description>
                        Commissioning connects to the specified controller over SSH. Broker credentials are never shown
                        in this UI.
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                  <TextField name="controllerIp" isRequired>
                    <Label>Controller IP address</Label>
                    <Input value={controllerIp} onChange={(event) => setControllerIp(event.target.value)} />
                  </TextField>
                  <TextField name="hardwareId" isRequired>
                    <Label>Controller hardware ID</Label>
                    <Input value={hardwareId} onChange={(event) => setHardwareId(event.target.value)} />
                  </TextField>
                  {mqttServersQuery.isPending ? (
                    <div className="wg:flex wg:justify-center wg:p-2">
                      <Spinner color="accent" size="sm" />
                    </div>
                  ) : mqttServersQuery.isError ? (
                    <ErrorAlert error={mqttServersQuery.error} />
                  ) : (
                    <Select
                      className="wg:w-full"
                      name="mqttServerId"
                      placeholder="Select an MQTT server"
                      value={mqttServerId}
                      onChange={setMqttServerId}
                    >
                      <Label>MQTT server</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox
                          renderEmptyState={() => (
                            <span className="wg:block wg:p-3 wg:text-sm wg:text-muted">
                              No MQTT servers configured.
                            </span>
                          )}
                        >
                          {(mqttServersQuery.data ?? []).map((server) => (
                            <ListBox.Item key={server.id} id={server.id.toString()} textValue={server.name}>
                              <div className="wg:flex wg:flex-col">
                                <span>{server.name}</span>
                                <span className="wg:text-xs wg:text-muted">
                                  {server.host}:{server.port}
                                  {server.useTls ? ' (TLS)' : ''}
                                </span>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  )}
                  {createSessionMutation.isError && <ErrorAlert error={createSessionMutation.error} />}
                </ModalBody>
                <ModalFooter>
                  <Button variant="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isPending={createSessionMutation.isPending}
                    isDisabled={
                      !hardwareId.trim() ||
                      selectedMqttServerId === null ||
                      mqttServersQuery.isPending ||
                      mqttServersQuery.isError
                    }
                  >
                    Create secure session
                  </Button>
                </ModalFooter>
              </Form>
            )}
            {session && (
              <ModalFooter>
                <Button variant="secondary" onPress={close}>
                  Close
                </Button>
              </ModalFooter>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function SessionStatus({
  session,
  isDelivering,
  deliveryElapsedSeconds,
  deliveryError,
  isRevoking,
  revokeError,
  sshUsername,
  sshPassword,
  physicalIdentityConfirmed,
  codesysStopAcknowledged,
  onSshUsernameChange,
  onSshPasswordChange,
  onPhysicalIdentityConfirmedChange,
  onCodesysStopAcknowledgedChange,
  onDeliver,
  onRevoke,
}: {
  session: CommissioningSession;
  isDelivering: boolean;
  deliveryElapsedSeconds: number;
  deliveryError: unknown;
  isRevoking: boolean;
  revokeError: unknown;
  sshUsername: string;
  sshPassword: string;
  physicalIdentityConfirmed: boolean;
  codesysStopAcknowledged: boolean;
  onSshUsernameChange: (value: string) => void;
  onSshPasswordChange: (value: string) => void;
  onPhysicalIdentityConfirmedChange: (value: boolean) => void;
  onCodesysStopAcknowledgedChange: (value: boolean) => void;
  onDeliver: () => void;
  onRevoke: () => void;
}) {
  return (
    <ModalBody>
      <p className="wg:text-sm wg:text-muted">
        Session status: <span className="wg:font-medium">{session.state}</span>
      </p>
      <p className="wg:text-sm wg:text-muted">Supported baseline: {session.firmwareBaseline}</p>
      <code className="wg:block wg:overflow-x-auto wg:rounded-medium wg:bg-default-100 wg:p-2 wg:text-xs">
        SSH host key: {session.hostKeyFingerprint}
      </code>
      {session.enrollmentExpiresAt && <p className="wg:text-sm wg:text-muted">Bootstrap expiry: {new Date(session.enrollmentExpiresAt).toLocaleString()}</p>}
      {session.pairingCode && <p className="wg:text-sm wg:text-muted">Pairing code: <span className="wg:font-medium">{session.pairingCode}</span></p>}
      {session.failureReason && <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Description>{session.failureReason}</Alert.Description></Alert.Content></Alert>}
      {isDelivering && <DeliveryProgress elapsedSeconds={deliveryElapsedSeconds} />}
      <p className="wg:text-sm wg:text-muted">Delivery tries the CC100 default SSH credentials first. Alternate accounts must be sudo-capable; their password is used for the privileged installation steps.</p>
      <TextField name="sshUsername">
        <Label>Alternate SSH username</Label>
        <Input value={sshUsername} onChange={(event) => onSshUsernameChange(event.target.value)} />
      </TextField>
      <TextField name="sshPassword" type="password">
        <Label>Alternate SSH password</Label>
        <Input value={sshPassword} onChange={(event) => onSshPasswordChange(event.target.value)} />
      </TextField>
      <Checkbox isSelected={physicalIdentityConfirmed} onChange={onPhysicalIdentityConfirmedChange}>
        <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>I verified this SSH host key, the hardware ID printed on this controller, and supported firmware baseline in person.</Checkbox.Content>
      </Checkbox>
      <Checkbox isSelected={codesysStopAcknowledged} onChange={onCodesysStopAcknowledgedChange}>
        <Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>I approve stopping CODESYS if it is active. This does not alter safety circuits or unrelated workloads.</Checkbox.Content>
      </Checkbox>
      <p className="wg:text-sm wg:text-muted">No broker credentials are available from this session.</p>
      {deliveryError && <ErrorAlert error={deliveryError} />}
      {revokeError && <ErrorAlert error={revokeError} />}
      {session.state !== 'revoked' && <Button isPending={isDelivering} isDisabled={!physicalIdentityConfirmed} onPress={onDeliver}>
        {deliveryError || session.state === 'delivery_failed' ? 'Retry delivery' : 'Deliver commissioning'}
      </Button>}
      {session.state !== 'revoked' && <Button variant="secondary" isPending={isRevoking} onPress={onRevoke}>Revoke bootstrap session</Button>}
    </ModalBody>
  );
}

function DeliveryProgress({ elapsedSeconds }: { elapsedSeconds: number }) {
  const phase = elapsedSeconds < 10
    ? 'Validating the controller and preparing its restricted broker enrollment.'
    : elapsedSeconds < 40
      ? 'Activating the official Docker runtime and preparing the signed bundle.'
      : 'Transferring the 70 MB signed runtime bundle. This can take several minutes on a CC100.';

  return (
    <Alert status="info">
      <Alert.Indicator><Spinner color="accent" size="sm" /></Alert.Indicator>
      <Alert.Content>
        <Alert.Title>Commissioning in progress ({formatDuration(elapsedSeconds)})</Alert.Title>
        <Alert.Description>{phase} Do not power off the controller.</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function ErrorAlert({ error }: { error: unknown }) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{error instanceof Error ? error.message : 'Please try again.'}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
