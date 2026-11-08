// The MQTT explorer next to the flow canvas, to test and debug an MQTT-based
// flow: a non-modal docked panel on desktop, so the canvas stays fully usable,
// and a drawer on narrow screens. Closing it ends the subscription.
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, DrawerBody, DrawerHeader, DrawerHeading, Spinner } from '@heroui/react';
import { StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Select } from '../../../../../components/select';
import { MqttMessageExplorer } from '../../../../mqtt/explorer/MqttMessageExplorer';
import { pickDefaultServerId, suggestTopics } from './mqttNodes';
import { useMdUp } from './useMdUp';
import de from './de.json';
import en from './en.json';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The editor's current nodes, unsaved changes included. */
  nodes: readonly { type?: string; data?: unknown }[];
}

function ExplorerContent({ nodes }: Pick<Props, 'nodes'>) {
  const { t } = useTranslations({ en, de });
  const { data: servers = [], isLoading } = useMqttServiceMqttServersGetAll();
  const [pickedServerId, setPickedServerId] = useState<number | null>(null);
  // Fixed when the panel opens, so editing nodes does not swap the server under a running subscription.
  const [initialServerId, setInitialServerId] = useState<number | null>(null);
  if (initialServerId === null && servers.length > 0) setInitialServerId(pickDefaultServerId(nodes, servers));

  const serverId = pickedServerId ?? initialServerId;
  if (isLoading || serverId === null) {
    return (
      <div className="flex justify-center p-6">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Select
        label={t('server')}
        value={String(serverId)}
        onChange={(key) => setPickedServerId(Number(key))}
        items={servers.map((server) => ({ key: String(server.id), label: server.name }))}
        data-cy="flow-mqtt-explorer-server-select"
      />
      <MqttMessageExplorer mqttServerId={serverId} topicSuggestions={suggestTopics(nodes, serverId)} compact />
    </div>
  );
}

export function FlowMqttExplorer({ isOpen, onClose, nodes }: Props) {
  const { t } = useTranslations({ en, de });
  const desktop = useMdUp();
  if (!isOpen) return null;

  if (desktop) {
    // Not a modal: it sits in the editor's flex row like the node catalog.
    return (
      <aside
        role="region"
        aria-label={t('title')}
        className="flex flex-col h-full min-h-0 w-[420px] shrink-0 border-l border-border bg-background"
        data-cy="flow-mqtt-explorer"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">{t('title')}</span>
          <Button isIconOnly size="sm" variant="ghost" onPress={onClose} aria-label={t('close')}>
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <ExplorerContent nodes={nodes} />
        </div>
      </aside>
    );
  }

  return (
    <StandardDrawer
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      contentProps={{ placement: 'right' }}
    >
      <DrawerHeader>
        <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
      </DrawerHeader>
      <DrawerBody>
        <ExplorerContent nodes={nodes} />
      </DrawerBody>
    </StandardDrawer>
  );
}
