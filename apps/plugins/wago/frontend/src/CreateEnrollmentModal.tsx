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
import { SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { EnrollmentPackage } from './api';
import {
  useCreateEnrollmentMutation,
  useEnrollmentCredentialSupportQuery,
  useMqttServersQuery,
  useSettingsQuery,
} from './queries';

interface CreateEnrollmentModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onOpenSettings: () => void;
}

export function CreateEnrollmentModal({ isOpen, onOpenChange, onOpenSettings }: CreateEnrollmentModalProps) {
  const createEnrollmentMutation = useCreateEnrollmentMutation();
  const settingsQuery = useSettingsQuery();
  const mqttServersQuery = useMqttServersQuery();
  const [hardwareId, setHardwareId] = useState('');
  const [mqttServerId, setMqttServerId] = useState<Key | null>(null);
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [manualUsername, setManualUsername] = useState('');
  const [manualPassword, setManualPassword] = useState('');

  useEffect(() => {
    if (isOpen) setMqttServerId(settingsQuery.data?.defaultMqttServerId?.toString() ?? null);
  }, [isOpen, settingsQuery.data?.defaultMqttServerId]);

  useEffect(() => {
    setUseCustomCredentials(false);
  }, [mqttServerId]);

  const selectedMqttServerId = mqttServerId === null ? null : Number(mqttServerId);
  const credentialSupportQuery = useEnrollmentCredentialSupportQuery(selectedMqttServerId);

  function close() {
    setHardwareId('');
    setMqttServerId(null);
    setUseCustomCredentials(false);
    setManualUsername('');
    setManualPassword('');
    createEnrollmentMutation.reset();
    onOpenChange(false);
  }

  function createPackage() {
    createEnrollmentMutation.mutate({
      hardwareId,
      mqttServerId: selectedMqttServerId ?? undefined,
      manualUsername: useCustomCredentials || credentialSupportQuery.data?.automatic === false ? manualUsername : undefined,
      manualPassword: useCustomCredentials || credentialSupportQuery.data?.automatic === false ? manualPassword : undefined,
    });
  }

  const packageData = createEnrollmentMutation.data;
  const needsMqttServer = mqttServerId === null && settingsQuery.data?.defaultMqttServerId === null;
  const needsCustomCredentials = useCustomCredentials || credentialSupportQuery.data?.automatic === false;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <ModalBackdrop>
        <ModalContainer size="lg">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>{packageData ? 'Enrollment package ready' : 'Enroll a WAGO controller'}</ModalHeading>
            </ModalHeader>
            {packageData ? (
              <EnrollmentInstructions enrollment={packageData} />
            ) : (
              <Form
                onSubmit={(event) => {
                  event.preventDefault();
                  createPackage();
                }}
              >
                <ModalBody>
                  <ol className="wg:space-y-3 wg:text-sm">
                    <li>
                      <span className="wg:font-medium">1. Choose the MQTT server.</span> The configured default is
                      preselected, but you can override it for this controller.
                    </li>
                    <li>
                      <span className="wg:font-medium">2. Identify the controller.</span> Enter the hardware ID printed
                      on the controller or shown in its runtime.
                    </li>
                    <li>
                      <span className="wg:font-medium">3. Apply the package.</span> The next screen provides the
                      short-lived broker and pairing details to enter on the controller.
                    </li>
                  </ol>
                  {needsMqttServer && !settingsQuery.isPending && (
                    <Alert status="warning">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>No default MQTT server</Alert.Title>
                        <Alert.Description>
                          Set a default MQTT server before creating an enrollment package.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  )}
                  {mqttServersQuery.isPending ? (
                    <div className="wg:flex wg:justify-center wg:p-2">
                      <Spinner color="accent" size="sm" />
                    </div>
                  ) : mqttServersQuery.isError ? (
                    <EnrollmentError error={mqttServersQuery.error} />
                  ) : (
                    <Select
                      className="wg:w-full"
                      name="mqttServerId"
                      placeholder="Select an MQTT server"
                      value={mqttServerId}
                      onChange={setMqttServerId}
                    >
                      <Label>MQTT server for this controller</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox
                          renderEmptyState={() => (
                            <span className="wg:block wg:p-3 wg:text-sm wg:text-muted">No MQTT servers configured.</span>
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
                  <TextField name="hardwareId" isRequired>
                    <Label>Controller hardware ID</Label>
                    <Input value={hardwareId} onChange={(event) => setHardwareId(event.target.value)} />
                  </TextField>
                  {credentialSupportQuery.isPending && selectedMqttServerId !== null && (
                    <div className="wg:flex wg:items-center wg:gap-2 wg:text-sm wg:text-muted">
                      <Spinner color="accent" size="sm" /> Checking credential provisioning...
                    </div>
                  )}
                  {credentialSupportQuery.isError && <EnrollmentError error={credentialSupportQuery.error} />}
                  {credentialSupportQuery.data?.automatic && (
                    <Checkbox isSelected={useCustomCredentials} onChange={setUseCustomCredentials}>
                      <Checkbox.Content>
                        <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                        Use custom discovery credentials
                      </Checkbox.Content>
                    </Checkbox>
                  )}
                  {needsCustomCredentials && (
                    <>
                      <p className="wg:text-xs wg:text-muted">
                        This server cannot automatically provision restricted discovery credentials. Enter credentials with
                        access limited to this controller&apos;s discovery and claim topics.
                      </p>
                      <TextField name="manualUsername" isRequired>
                        <Label>Manual discovery username</Label>
                        <Input value={manualUsername} onChange={(event) => setManualUsername(event.target.value)} />
                      </TextField>
                      <TextField name="manualPassword" type="password" isRequired>
                        <Label>Manual discovery password</Label>
                        <Input value={manualPassword} onChange={(event) => setManualPassword(event.target.value)} />
                      </TextField>
                    </>
                  )}
                  {createEnrollmentMutation.isError && <EnrollmentError error={createEnrollmentMutation.error} />}
                </ModalBody>
                <ModalFooter>
                  <Button variant="secondary" onPress={close}>
                    Cancel
                  </Button>
                  <Button variant="secondary" onPress={onOpenSettings}>
                    <SettingsIcon className="wg:h-4 wg:w-4" /> MQTT settings
                  </Button>
                  <Button
                    type="submit"
                    isPending={createEnrollmentMutation.isPending}
                    isDisabled={
                      needsMqttServer ||
                      mqttServersQuery.isPending ||
                      mqttServersQuery.isError ||
                      credentialSupportQuery.isPending ||
                      credentialSupportQuery.isError
                    }
                  >
                    Create package
                  </Button>
                </ModalFooter>
              </Form>
            )}
            {packageData && (
              <ModalFooter>
                <Button onPress={close}>Done</Button>
              </ModalFooter>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}

function EnrollmentInstructions({ enrollment }: { enrollment: EnrollmentPackage }) {
  return (
    <ModalBody>
      <p className="wg:text-sm wg:text-muted">
        This package expires at {new Date(enrollment.expiresAt).toLocaleString()}. Keep these credentials private and
        apply them before it expires.
      </p>
      <ol className="wg:space-y-4 wg:text-sm">
        <li>
          <span className="wg:font-medium">1. Connect to the broker.</span>
          <Credential
            value={`${enrollment.broker.host}:${enrollment.broker.port}${enrollment.broker.useTls ? ' (TLS)' : ''}`}
          />
        </li>
        <li>
          <span className="wg:font-medium">2. Enter the discovery credentials.</span>
          <Credential label="Username" value={enrollment.username} />
          {enrollment.password && <Credential label="Password" value={enrollment.password} />}
        </li>
        <li>
          <span className="wg:font-medium">3. Set the pairing secret.</span>
          <Credential value={enrollment.claimSecret} />
        </li>
        <li>
          <span className="wg:font-medium">4. Start the controller.</span> It will appear in the controller list, where
          you can verify and claim it.
        </li>
      </ol>
      {enrollment.manualInstructions?.length ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Manual MQTT setup required</Alert.Title>
            <Alert.Description>{enrollment.manualInstructions.join(' ')}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </ModalBody>
  );
}

function Credential({ label, value }: { label?: string; value: string }) {
  return (
    <code className="wg:mt-1 wg:block wg:overflow-x-auto wg:rounded-medium wg:bg-default-100 wg:p-2 wg:text-xs">
      {label ? `${label}: ${value}` : value}
    </code>
  );
}

function EnrollmentError({ error }: { error: unknown }) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{error instanceof Error ? error.message : 'Please try again.'}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
