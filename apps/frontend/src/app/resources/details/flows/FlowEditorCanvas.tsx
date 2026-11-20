import { Button, useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAppTheme } from '@attraccess/ui';
import { useCallback, useMemo, useRef } from 'react';
import { flowOwnerKey } from './flowOwner';
import { useNodeSchemasSettled } from './canvas/useNodeSchemasSettled';
import { Background, BackgroundVariant, Controls, ReactFlow, Panel, SelectionMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ButtonGroup, Spinner } from '@heroui/react';
import {
  BoxSelectIcon,
  Braces as BracesIcon,
  DownloadIcon,
  HandIcon,
  LayoutGridIcon,
  LogsIcon,
  PlusIcon,
  RadioTowerIcon,
  SaveIcon,
  UploadIcon,
} from 'lucide-react';
import { NodeCatalogHandle, NodeCatalogPanel } from './nodeCatalog';
import { LogViewer } from './logViewer';
import { VariablesModal } from './variablesModal';
import { FlowNodeQuerySelection } from './FlowNodeQuerySelection';
import { FlowUnsavedChangesGuard } from './FlowUnsavedChangesGuard';
import { EdgeWithDeleteButton } from './edgeWithDeleteButton';
import { useCanvasInteractionMode } from './canvas/useCanvasInteractionMode';
import { useFlowCanvasData } from './canvas/useFlowCanvasData';
import { useFlowKeyboardShortcuts } from './canvas/useFlowKeyboardShortcuts';
import { useFlowLayoutActions } from './canvas/useFlowLayoutActions';
import { useFlowNodeDrop } from './canvas/useFlowNodeDrop';
import { useFlowRunFeedback } from './canvas/useFlowRunFeedback';
import { useFlowContext } from './context/index';
import de from './de.json';
import en from './en.json';
import nodesDeTranslations from './node/de.json';
import nodesEnTranslations from './node/en.json';
import { FlowMqttExplorer } from './mqttExplorer';
import { editorHoldsFlowNodes, useMqttNodeUses } from './mqttExplorer/mqttNodes';
import { useRememberedOpen } from './mqttExplorer/useRememberedOpen';
import { useAuth } from '../../../../hooks/useAuth';
import { MQTT_EXPLORER_PERMISSION } from '../../../mqtt/explorer/permission';
import { useMqttServersGetAll } from '@attraccess/react-query-client';

const edgeTypes = { 'attraccess-edge': EdgeWithDeleteButton };

/** The flow canvas with its toolbar, node catalog, log viewer and MQTT explorer; reads the owner from FlowProvider. */
export function FlowEditorCanvas() {
  const { owner, nodes, edges, setNodes, onNodesChange, onEdgesChange, onConnect, flowNodeTypes } = useFlowContext();
  const { resolvedTheme } = useAppTheme();
  const { t } = useTranslations({ en, de });
  const { t: tNodeTranslations } = useTranslations({ de: nodesDeTranslations, en: nodesEnTranslations });
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);
  const nodeCatalogRef = useRef<NodeCatalogHandle>(null);
  const {
    originalFlowData,
    isFlowError,
    isFlowLoading,
    saveFailed,
    isSaving,
    flowHasChanged,
    save,
    handleExport,
    handleImportClick,
  } = useFlowCanvasData();
  // React Flow warns (#002) when node type keys change after it mounts, and draws default nodes (#003) for types it
  // does not know yet. So the canvas mounts once the schemas are in; until then the loading overlay covers it.
  const nodeSchemasPending = !useNodeSchemasSettled(owner);
  const showLoading = isFlowLoading || nodeSchemasPending;
  const { layout, addStartNode } = useFlowLayoutActions();
  const { onDragOver, onDropNode } = useFlowNodeDrop();
  const { flowIsRunning, confettiEnabled, setConfettiEnabled } = useFlowRunFeedback();
  const { interactionMode, setInteractionMode, panOnDrag, selectionOnDrag } = useCanvasInteractionMode();
  useFlowKeyboardShortcuts(mousePosRef);
  const edgesWithCorrectType = useMemo(
    () => edges.map((edge) => ({ ...edge, type: edge.type ?? 'attraccess-edge', animated: flowIsRunning })),
    [edges, flowIsRunning],
  );
  const { hasPermission } = useAuth();
  const canUseMqttExplorer = hasPermission(MQTT_EXPLORER_PERMISSION);
  const { data: mqttServers } = useMqttServersGetAll({}, undefined, { enabled: canUseMqttExplorer });
  const [mqttExplorerOpen, setMqttExplorerOpen] = useRememberedOpen();
  const showMqttExplorer = canUseMqttExplorer && (mqttServers?.length ?? 0) > 0;
  // Stable props, so the explorer panel does not re-render on every canvas change (e.g. each drag frame).
  const mqttExplorerToggleRef = useRef<HTMLButtonElement>(null);
  const closeMqttExplorer = useCallback(() => setMqttExplorerOpen(false), [setMqttExplorerOpen]);
  const mqttNodes = useMqttNodeUses(nodes);

  return (
    <div className="h-full w-full flex flex-col">
      <FlowUnsavedChangesGuard isDirty={flowHasChanged} />
      <div className="flex flex-row w-full flex-1 min-h-0 rounded-lg overflow-hidden border border-border">
        <NodeCatalogPanel
          ref={nodeCatalogRef}
          owner={owner}
          onSelect={addStartNode}
          tNodeTranslations={tNodeTranslations}
        />
        <div
          className="flex-1 h-full relative"
          onMouseMove={(e) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
          }}
        >
          {!nodeSchemasPending && (
            <ReactFlow
              className="[--xy-background-color:var(--background)] [--xy-background-pattern-color:var(--border)]
              [--xy-edge-stroke:var(--muted)] [--xy-edge-stroke-selected:var(--accent)]
              [--xy-connectionline-stroke:var(--accent)]
              [--xy-handle-background-color:var(--foreground)] [--xy-handle-border-color:var(--surface)]
              [--xy-controls-button-background-color:var(--surface)] [--xy-controls-button-background-color-hover:var(--surface-secondary)]
              [--xy-controls-button-color:var(--foreground)] [--xy-controls-button-color-hover:var(--foreground)]
              [--xy-controls-button-border-color:var(--border)] [--xy-controls-box-shadow:var(--surface-shadow)]
              [--xy-selection-background-color:var(--accent-soft)] [--xy-selection-border:1px_dotted_var(--accent)]"
              nodes={nodes}
              edges={edgesWithCorrectType}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDropNode}
              onDragOver={onDragOver}
              selectionOnDrag={selectionOnDrag}
              panOnDrag={panOnDrag}
              selectionMode={SelectionMode.Partial}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode="Shift"
              colorMode={resolvedTheme}
              fitView
              // ponytail: fixed floor, derive it from the graph bounding box if 0.02 ever bites.
              // React Flow's default minZoom of 0.5 clamps fitView on flows taller than the pane,
              // which then centres on the bounding box and parks the viewport in a gap between
              // nodes - the canvas looks empty even though every node is rendered.
              minZoom={0.02}
              defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
              nodeTypes={flowNodeTypes}
              edgeTypes={edgeTypes}
            >
              <Controls />
              <FlowNodeQuerySelection key={flowOwnerKey(owner)} nodes={nodes} setNodes={setNodes} />
              <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

              <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
                <ButtonGroup>
                  <Button
                    isIconOnly
                    variant={interactionMode === 'pan' ? 'primary' : 'ghost'}
                    onPress={() => setInteractionMode('pan')}
                    aria-label={t('actions.modePan')}
                    aria-pressed={interactionMode === 'pan'}
                  >
                    <HandIcon />
                  </Button>
                  <Button
                    isIconOnly
                    variant={interactionMode === 'select' ? 'primary' : 'ghost'}
                    onPress={() => setInteractionMode('select')}
                    aria-label={t('actions.modeSelect')}
                    aria-pressed={interactionMode === 'select'}
                  >
                    <BoxSelectIcon />
                  </Button>
                </ButtonGroup>
                <Button
                  isIconOnly
                  isPending={isSaving}
                  onPress={save}
                  isDisabled={!flowHasChanged}
                  variant={saveFailed ? 'danger-soft' : flowHasChanged ? 'primary' : 'secondary'}
                >
                  <SaveIcon />
                </Button>
                <Button
                  isIconOnly
                  onPress={handleImportClick}
                  aria-label={t('actions.import')}
                  isDisabled={isFlowLoading}
                >
                  <UploadIcon />
                </Button>
                <Button isIconOnly onPress={handleExport} aria-label={t('actions.export')} isDisabled={isFlowLoading}>
                  <DownloadIcon />
                </Button>
                <LogViewer confettiEnabled={confettiEnabled} onConfettiEnabledChange={setConfettiEnabled}>
                  {(open) => (
                    <Button isIconOnly onPress={open} aria-label={t('actions.logs')}>
                      <LogsIcon />
                    </Button>
                  )}
                </LogViewer>

                {/* Variables are managed through a resource; a global flow has none to open them for. */}
                {owner.kind === 'resource' && (
                  <VariablesModal resourceId={owner.resourceId}>
                    {(open) => (
                      <Button isIconOnly onPress={open} aria-label={t('actions.variables')}>
                        <BracesIcon />
                      </Button>
                    )}
                  </VariablesModal>
                )}

                {showMqttExplorer && (
                  <Button
                    ref={mqttExplorerToggleRef}
                    isIconOnly
                    // Closed it looks like its neighbours; open it stands out as switched on.
                    variant={mqttExplorerOpen ? 'outline' : undefined}
                    onPress={() => setMqttExplorerOpen(!mqttExplorerOpen)}
                    aria-label={t('actions.mqttExplorer')}
                    aria-pressed={mqttExplorerOpen}
                    data-cy="flow-mqtt-explorer-toggle"
                  >
                    <RadioTowerIcon />
                  </Button>
                )}

                <Button isIconOnly onPress={layout} isDisabled={isFlowLoading}>
                  <LayoutGridIcon />
                </Button>
                <Button
                  isIconOnly
                  variant="primary"
                  onPress={() => nodeCatalogRef.current?.open()}
                  aria-label={t('actions.addNode')}
                  className="md:hidden"
                  isDisabled={isFlowLoading}
                >
                  <PlusIcon />
                </Button>
              </Panel>
            </ReactFlow>
          )}
          {(showLoading || (isFlowError && !originalFlowData)) && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm"
              role={isFlowError ? 'alert' : 'status'}
              aria-live="polite"
              aria-label={isFlowError ? t('loadError') : t('loading')}
              aria-busy={showLoading}
            >
              {isFlowError ? (
                <p className="text-danger text-sm text-center px-4">{t('loadError')}</p>
              ) : (
                <Spinner size="lg" />
              )}
            </div>
          )}
        </div>
        {showMqttExplorer && (
          <FlowMqttExplorer
            isOpen={mqttExplorerOpen}
            onClose={closeMqttExplorer}
            mqttNodes={mqttNodes}
            returnFocusRef={mqttExplorerToggleRef}
            nodesReady={editorHoldsFlowNodes({
              isError: isFlowError,
              loaded: originalFlowData,
              editorNodeCount: nodes.length,
            })}
          />
        )}
      </div>
    </div>
  );
}
