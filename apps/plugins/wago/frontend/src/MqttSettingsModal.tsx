import {
  Alert,
  Button,
  Form,
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
} from '@heroui/react';
import type { Key } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useMqttServersQuery, useSettingsQuery, useUpdateSettingsMutation } from './queries';

interface MqttSettingsModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function MqttSettingsModal({ isOpen, onOpenChange }: MqttSettingsModalProps) {
  const settingsQuery = useSettingsQuery();
  const serversQuery = useMqttServersQuery();
  const updateSettingsMutation = useUpdateSettingsMutation();
  const [defaultServerId, setDefaultServerId] = useState<Key | null>(null);

  useEffect(() => {
    setDefaultServerId(settingsQuery.data?.defaultMqttServerId?.toString() ?? null);
  }, [settingsQuery.data]);

  function close() {
    updateSettingsMutation.reset();
    onOpenChange(false);
  }

  function save() {
    updateSettingsMutation.mutate(defaultServerId === null ? null : Number(defaultServerId), { onSuccess: close });
  }

  const isLoading = settingsQuery.isPending || serversQuery.isPending;
  const error = settingsQuery.isError ? settingsQuery.error : serversQuery.isError ? serversQuery.error : null;

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && close()}>
      <ModalBackdrop>
        <ModalContainer size="sm">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>WAGO settings</ModalHeading>
            </ModalHeader>
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <ModalBody>
                <p className="wg:text-sm wg:text-muted">
                  Choose the MQTT server used for new WAGO commissioning sessions. Change it before commissioning a
                  controller.
                </p>
                {isLoading ? (
                  <div className="wg:flex wg:justify-center wg:p-4">
                    <Spinner color="accent" size="sm" />
                  </div>
                ) : error ? (
                  <ErrorAlert error={error} />
                ) : (
                  <Select
                    className="wg:w-full"
                    name="defaultMqttServerId"
                    placeholder="Select an MQTT server"
                    value={defaultServerId}
                    onChange={setDefaultServerId}
                  >
                    <Label>Default MQTT server</Label>
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
                        {(serversQuery.data ?? []).map((server) => (
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
                {updateSettingsMutation.isError && <ErrorAlert error={updateSettingsMutation.error} />}
              </ModalBody>
              <ModalFooter>
                <Button variant="secondary" onPress={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  isDisabled={isLoading || error !== null}
                  isPending={updateSettingsMutation.isPending}
                >
                  Save settings
                </Button>
              </ModalFooter>
            </Form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
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
