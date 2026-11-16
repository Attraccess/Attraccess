// The MQTT explorer next to the flow canvas, to test and debug an MQTT-based
// flow: a non-modal docked panel on wide screens, so the canvas stays fully
// usable, and a drawer below `lg`. Closing it ends the subscription.
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { Button, DrawerBody, DrawerHeader, DrawerHeading, Spinner } from '@heroui/react';
import { StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { useMqttServiceMqttServersGetAll } from '@attraccess/react-query-client';
import { XIcon } from 'lucide-react';
import { memo, useMemo, useState, type RefObject } from 'react';
import { Select } from '../../../../../components/select';
import { useMinWidth } from '../../../../../hooks/useIsDesktop';
import { MqttMessageExplorer } from '../../../../mqtt/explorer/MqttMessageExplorer';
import { pickDefaultServerId, suggestTopics, type MqttNodeUse } from './mqttNodes';
import de from './de.json';
import en from './en.json';

// Tailwind's `lg`: below it the 420 px panel beside the node catalog leaves too little canvas.
export const DOCKED_MIN_WIDTH = 1024;

const NO_SERVERS: readonly { id: number; name: string }[] = [];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The MQTT uses of the editor's current nodes (unsaved changes included), see `useMqttNodeUses`. */
  mqttNodes: readonly MqttNodeUse[];
  /** False while the flow is still loading: its nodes are not there yet to pick the server from. */
  nodesReady: boolean;
  /** Receives focus when the docked panel is closed through its close button. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const ExplorerContent = memo(function ExplorerContent({
  mqttNodes,
  nodesReady,
}: Pick<Props, 'mqttNodes' | 'nodesReady'>) {
  const { t } = useTranslations({ en, de });
  const { data: servers = NO_SERVERS, isLoading } = useMqttServiceMqttServersGetAll();
  const [pickedServerId, setPickedServerId] = useState<number | null>(null);
  // Fixed when the panel opens (once the flow is loaded, as a reload can reopen the panel before its nodes
  // arrive), so editing nodes does not swap the server under a running subscription.
  const [initialServerId, setInitialServerId] = useState<number | null>(null);
  if (initialServerId === null && nodesReady && servers.length > 0) {
    setInitialServerId(pickDefaultServerId(mqttNodes, servers));
  }

  const serverId = pickedServerId ?? initialServerId;
  const serverItems = useMemo(
    () => servers.map((server) => ({ key: String(server.id), label: server.name })),
    [servers],
  );
  const topicSuggestions = useMemo(
    () => (serverId === null ? undefined : suggestTopics(mqttNodes, serverId)),
    [mqttNodes, serverId],
  );

  if (isLoading || serverId === null) {
    return (
      <div className="flex justify-center p-6" role="status" aria-label={t('loading')}>
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
        items={serverItems}
        data-cy="flow-mqtt-explorer-server-select"
      />
      <MqttMessageExplorer mqttServerId={serverId} topicSuggestions={topicSuggestions} compact />
    </div>
  );
});

export const FlowMqttExplorer = memo(function FlowMqttExplorer({
  isOpen,
  onClose,
  mqttNodes,
  nodesReady,
  returnFocusRef,
}: Props) {
  const { t } = useTranslations({ en, de });
  const docked = useMinWidth(DOCKED_MIN_WIDTH);
  if (!isOpen) return null;

  if (docked) {
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
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => {
              onClose();
              // The close button disappears with the panel; hand focus back to the toolbar toggle.
              returnFocusRef?.current?.focus();
            }}
            aria-label={t('close')}
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <ExplorerContent mqttNodes={mqttNodes} nodesReady={nodesReady} />
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
        <div className="flex w-full items-start justify-between gap-3">
          <DrawerHeading className="text-lg font-semibold">{t('title')}</DrawerHeading>
          <Button
            isIconOnly
            variant="ghost"
            aria-label={t('close')}
            onPress={onClose}
            data-cy="flow-mqtt-explorer-close"
          >
            <XIcon size={16} />
          </Button>
        </div>
      </DrawerHeader>
      <DrawerBody>
        <ExplorerContent mqttNodes={mqttNodes} nodesReady={nodesReady} />
      </DrawerBody>
    </StandardDrawer>
  );
});
