import { useParams } from 'react-router-dom';
import { Background, BackgroundVariant, Controls, ReactFlow, Panel, SelectionMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ButtonGroup, Spinner } from '@heroui/react';
import { Button } from '../../../../components/button';
import {
  BoxSelectIcon,
  Braces as BracesIcon,
  DownloadIcon,
  HandIcon,
  LayoutGridIcon,
  LogsIcon,
  PlusIcon,
  SaveIcon,
  UploadIcon,
} from 'lucide-react';
import { NodeCatalogPanel } from './nodeCatalog';
import { FlowProvider } from './context/index';
import { LogViewer } from './logViewer';
import { VariablesModal } from './variablesModal';
import { FlowNodeQuerySelection } from './FlowNodeQuerySelection';
import { useFlowEditor } from './canvas/useFlowEditor';

// Efficient comparison functions to replace expensive JSON.stringify operations

function FlowsPageInner() {
  const model = useFlowEditor();

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex flex-row w-full flex-1 min-h-0 rounded-lg overflow-hidden border border-border">
        <NodeCatalogPanel
          ref={model.nodeCatalogRef}
          resourceId={Number(model.resourceId)}
          onSelect={model.addStartNode}
          tNodeTranslations={model.tNodeTranslations}
        />
        <div
          className="flex-1 h-full relative"
          onMouseMove={(e) => {
            model.mousePosRef.current = { x: e.clientX, y: e.clientY };
          }}
        >
          <ReactFlow
            className="[--xy-background-color:var(--background)] [--xy-background-pattern-color:var(--border)]
              [--xy-edge-stroke:var(--muted)] [--xy-edge-stroke-selected:var(--accent)]
              [--xy-connectionline-stroke:var(--accent)]
              [--xy-handle-background-color:var(--foreground)] [--xy-handle-border-color:var(--surface)]
              [--xy-controls-button-background-color:var(--surface)] [--xy-controls-button-background-color-hover:var(--surface-secondary)]
              [--xy-controls-button-color:var(--foreground)] [--xy-controls-button-color-hover:var(--foreground)]
              [--xy-controls-button-border-color:var(--border)] [--xy-controls-box-shadow:var(--surface-shadow)]
              [--xy-selection-background-color:var(--accent-soft)] [--xy-selection-border:1px_dotted_var(--accent)]"
            nodes={model.nodes}
            edges={model.edgesWithCorrectType}
            onNodesChange={model.onNodesChange}
            onEdgesChange={model.onEdgesChange}
            onConnect={model.onConnect}
            onDrop={model.onDropNode}
            onDragOver={model.onDragOver}
            selectionOnDrag={model.selectionOnDrag}
            panOnDrag={model.panOnDrag}
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            colorMode={model.resolvedTheme}
            fitView
            // ponytail: fixed floor, derive it from the graph bounding box if 0.02 ever bites.
            // React Flow's default minZoom of 0.5 clamps fitView on flows taller than the pane,
            // which then centres on the bounding box and parks the viewport in a gap between
            // nodes - the canvas looks empty even though every node is rendered.
            minZoom={0.02}
            defaultEdgeOptions={{ style: { strokeWidth: 4 } }}
            nodeTypes={model.flowNodeTypes}
            edgeTypes={model.edgeTypes}
          >
            <Controls />
            <FlowNodeQuerySelection key={model.resourceId} nodes={model.nodes} setNodes={model.setNodes} />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />

            <Panel position="top-right" className="flex flex-row flex-wrap gap-2">
              <ButtonGroup>
                <Button
                  isIconOnly
                  variant={model.interactionMode === 'pan' ? 'primary' : 'ghost'}
                  onPress={() => model.setInteractionMode('pan')}
                  aria-label={model.t('actions.modePan')}
                  aria-pressed={model.interactionMode === 'pan'}
                >
                  <HandIcon />
                </Button>
                <Button
                  isIconOnly
                  variant={model.interactionMode === 'select' ? 'primary' : 'ghost'}
                  onPress={() => model.setInteractionMode('select')}
                  aria-label={model.t('actions.modeSelect')}
                  aria-pressed={model.interactionMode === 'select'}
                >
                  <BoxSelectIcon />
                </Button>
              </ButtonGroup>
              <Button
                isIconOnly
                isPending={model.isSaving}
                onPress={model.save}
                isDisabled={!model.flowHasChanged}
                variant={model.saveFailed ? 'danger-soft' : model.flowHasChanged ? 'primary' : 'secondary'}
              >
                <SaveIcon />
              </Button>
              <Button
                isIconOnly
                onPress={model.handleImportClick}
                aria-label={model.t('actions.import')}
                isDisabled={model.isFlowLoading}
              >
                <UploadIcon />
              </Button>
              <Button
                isIconOnly
                onPress={model.handleExport}
                aria-label={model.t('actions.export')}
                isDisabled={model.isFlowLoading}
              >
                <DownloadIcon />
              </Button>
              <LogViewer
                resourceId={Number(model.resourceId)}
                confettiEnabled={model.confettiEnabled}
                onConfettiEnabledChange={model.setConfettiEnabled}
              >
                {(open) => (
                  <Button isIconOnly onPress={open} aria-label={model.t('actions.logs')}>
                    <LogsIcon />
                  </Button>
                )}
              </LogViewer>

              <VariablesModal resourceId={Number(model.resourceId)}>
                {(open) => (
                  <Button isIconOnly onPress={open} aria-label={model.t('actions.variables')}>
                    <BracesIcon />
                  </Button>
                )}
              </VariablesModal>

              <Button isIconOnly onPress={model.layout} isDisabled={model.isFlowLoading}>
                <LayoutGridIcon />
              </Button>
              <Button
                isIconOnly
                variant="primary"
                onPress={() => model.nodeCatalogRef.current?.open()}
                aria-label={model.t('actions.addNode')}
                className="md:hidden"
                isDisabled={model.isFlowLoading}
              >
                <PlusIcon />
              </Button>
            </Panel>
          </ReactFlow>
          {(model.isFlowLoading || (model.isFlowError && !model.originalFlowData)) && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm"
              role={model.isFlowError ? 'alert' : 'status'}
              aria-live="polite"
              aria-label={model.isFlowError ? model.t('loadError') : model.t('loading')}
              aria-busy={model.isFlowLoading}
            >
              {model.isFlowError ? (
                <p className="text-danger text-sm text-center px-4">{model.t('loadError')}</p>
              ) : (
                <Spinner size="lg" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlowsPage() {
  const { id: resourceId } = useParams();

  return (
    <FlowProvider key={resourceId} resourceId={Number(resourceId)}>
      <FlowsPageInner />
    </FlowProvider>
  );
}
