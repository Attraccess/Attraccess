// zigbee2mqtt gateway configuration (ATT-789).
//
// Zigbee devices are reached through a z2m instance rather than their own MQTT
// client, so the plugin needs to know which broker z2m publishes to and under
// which base topic. Everything else about the Zigbee network (channel, network
// key, map) stays in the z2m frontend — deliberately out of scope.
import {
  Button,
  Chip,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Description,
  Label,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@heroui/react';
import { RadioTowerIcon, SaveIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { getGatewayStatus, listMqttServers, saveGateway, type GatewayStatus, type MqttServerSummary } from './api';
import { StandardDrawer, TextFieldRow } from './drawer';
import { StatusAlert } from './StatusAlert';

/** Traffic-light for the two things that can independently be down. */
export function GatewayStatusChips({ status }: { status: GatewayStatus }) {
  if (!status.configured) {
    return (
      <Chip variant="soft" color="default" size="sm" data-cy="shelly-gateway-chip-unconfigured">
        Not configured
      </Chip>
    );
  }
  return (
    <div className="sh:flex sh:flex-wrap sh:items-center sh:gap-1.5">
      <Chip
        variant="soft"
        color={status.connected ? 'success' : 'danger'}
        size="sm"
        data-cy="shelly-gateway-chip-broker"
      >
        {status.connected ? 'Broker connected' : 'Broker unreachable'}
      </Chip>
      <Chip
        variant="soft"
        color={status.bridgeOnline ? 'success' : 'warning'}
        size="sm"
        data-cy="shelly-gateway-chip-bridge"
      >
        {status.bridgeOnline ? 'zigbee2mqtt online' : 'zigbee2mqtt offline'}
      </Chip>
      {status.connected && (
        <Chip variant="soft" size="sm" data-cy="shelly-gateway-chip-devices">
          {status.deviceCount} device{status.deviceCount === 1 ? '' : 's'}
        </Chip>
      )}
    </div>
  );
}

export function ZigbeeGatewayDrawer({
  isOpen,
  onOpenChange,
  onSaved,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [servers, setServers] = useState<MqttServerSummary[]>([]);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [mqttServerId, setMqttServerId] = useState<string>('');
  const [baseTopic, setBaseTopic] = useState('zigbee2mqtt');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [serverList, current] = await Promise.all([listMqttServers(), getGatewayStatus()]);
        setServers(serverList);
        setStatus(current);
        setMqttServerId(current.mqttServerId === null ? '' : String(current.mqttServerId));
        setBaseTopic(current.baseTopic ?? 'zigbee2mqtt');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const submit = useCallback(async () => {
    if (!mqttServerId) {
      setError('Pick the MQTT server your zigbee2mqtt instance publishes to.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setStatus(await saveGateway({ mqttServerId: Number(mqttServerId), baseTopic: baseTopic.trim() || 'zigbee2mqtt' }));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [baseTopic, mqttServerId, onSaved]);

  return (
    <StandardDrawer isOpen={isOpen} onOpenChange={onOpenChange} label="Zigbee gateway">
      <DrawerHeader>
        <div className="sh:flex sh:w-full sh:items-start sh:justify-between sh:gap-3">
          <div className="sh:flex sh:min-w-0 sh:flex-col sh:gap-1">
            <div className="sh:flex sh:items-center sh:gap-2">
              <RadioTowerIcon className="sh:h-5 sh:w-5 sh:shrink-0 sh:text-accent-soft-foreground" />
              <h2 className="sh:text-lg sh:font-semibold">Zigbee gateway</h2>
            </div>
            <p className="sh:text-sm sh:text-muted">
              Point Attraccess at your zigbee2mqtt instance. The Zigbee network itself (channel, network key, map) stays
              in the zigbee2mqtt frontend.
            </p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close" onPress={close}>
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {loading ? (
          <div className="sh:flex sh:items-center sh:justify-center sh:p-6">
            <Spinner color="accent" />
          </div>
        ) : (
          <div className="sh:flex sh:flex-col sh:gap-4">
            {status && (
              <div className="sh:flex sh:flex-col sh:gap-2">
                <span className="sh:text-xs sh:font-medium sh:text-muted">Status</span>
                <GatewayStatusChips status={status} />
                {status.error && (
                  <StatusAlert status="warning" title="Last connection attempt failed" dataCy="shelly-gateway-status-error">
                    {status.error}
                  </StatusAlert>
                )}
              </div>
            )}

            {servers.length === 0 ? (
              <StatusAlert status="warning" title="No MQTT servers configured" dataCy="shelly-gateway-no-servers">
                Add the broker your zigbee2mqtt instance publishes to under Settings → MQTT servers first.
              </StatusAlert>
            ) : (
              <Select
                value={mqttServerId}
                onChange={(key) => setMqttServerId(String(key))}
                placeholder="Select an MQTT server"
                isRequired
                data-cy="shelly-gateway-server"
              >
                <Label>MQTT server</Label>
                <Description>The broker zigbee2mqtt is configured to publish to.</Description>
                <SelectTrigger>
                  <SelectValue />
                  <SelectIndicator />
                </SelectTrigger>
                <SelectPopover>
                  <ListBox>
                    {servers.map((server) => (
                      <ListBoxItem
                        key={server.id}
                        id={String(server.id)}
                        textValue={server.name}
                        data-cy={`shelly-gateway-server-${server.id}`}
                      >
                        {server.name} ({server.host}:{server.port})
                      </ListBoxItem>
                    ))}
                  </ListBox>
                </SelectPopover>
              </Select>
            )}

            <TextFieldRow
              label="Base topic"
              value={baseTopic}
              onChange={setBaseTopic}
              placeholder="zigbee2mqtt"
              description="Must match mqtt.base_topic in your zigbee2mqtt configuration."
              dataCy="shelly-gateway-base-topic"
            />

            {error && (
              <StatusAlert status="danger" title="Could not save the gateway" dataCy="shelly-gateway-error">
                {error}
              </StatusAlert>
            )}
          </div>
        )}
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onPress={close}>
          Close
        </Button>
        <Button
          variant="primary"
          isPending={submitting}
          isDisabled={servers.length === 0}
          onPress={() => void submit()}
          data-cy="shelly-gateway-submit"
        >
          <SaveIcon className="sh:h-4 sh:w-4" /> Save gateway
        </Button>
      </DrawerFooter>
    </StandardDrawer>
  );
}
