import { ResourceFlowLogType, ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';

import { NodeProps } from '@xyflow/react';
import { Button, Card, Code, cn, Tooltip, TooltipContent, TooltipTrigger, useOverlayState } from '@heroui/react';
import { Handle, NodeToolbar, Position, useNodeId } from '@xyflow/react';
import { Edit2Icon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useFlowContext } from '../flowContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteConfirmationModal } from '../../../../../components/deleteConfirmationModal';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useNodePreviewRows } from './preview';
import { NodeEditor } from './editor';
import { TExists, TFunction } from '@attraccess/plugins-frontend-ui';

interface Props {
  tNodeTranslations: TFunction;
  tNodeExists?: TExists;
  schema: ResourceFlowNodeSchemaDto;
  node?: NodeProps;
  previewMode?: boolean;
  data?: {
    forceToolbarVisible?: boolean;
    toolbarPosition?: Position;
  };
  validationError?: string;
}

enum ProcessingState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export function AttraccessNode(props: Props) {
  const { schema, previewMode, tNodeTranslations: t, tNodeExists, data, validationError } = props;

  const nodeId = useNodeId();

  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);

  const onLiveLog = useCallback(
    (log: ResourceFlowLog) => {
      if (log.type === 'flow.completed') {
        setTimeout(() => {
          setProcessingState(ProcessingState.IDLE);
        }, 1000);
        return;
      }

      if (log.nodeId !== nodeId) {
        return;
      }

      switch (log.type) {
        case ResourceFlowLogType.NODE_PROCESSING_STARTED:
          setProcessingState(ProcessingState.PROCESSING);
          break;
        case ResourceFlowLogType.NODE_PROCESSING_COMPLETED:
          setProcessingState(ProcessingState.COMPLETED);
          break;
        case ResourceFlowLogType.NODE_PROCESSING_FAILED:
          setProcessingState(ProcessingState.FAILED);
          break;
      }
    },
    [nodeId],
  );

  const { addLiveLogReceiver, removeLiveLogReceiver, removeNode } = useFlowContext();

  useEffect(() => {
    if (!nodeId || previewMode) {
      return;
    }

    addLiveLogReceiver(onLiveLog);
    return () => removeLiveLogReceiver(onLiveLog);
  }, [addLiveLogReceiver, removeLiveLogReceiver, onLiveLog, nodeId, previewMode]);

  const remove = useCallback(() => {
    if (!nodeId) {
      return;
    }

    removeNode(nodeId);
  }, [removeNode, nodeId]);

  const {
    isOpen: showDeleteConfirmation,
    open: userWantsToDelete,
    close: userDoesNotWantToDelete,
  } = useOverlayState();

  const isSelected = props.node?.selected ?? false;

  const cardClasses = useMemo(() => {
    const baseClasses = 'bg-gray-100 dark:bg-gray-800 w-64 overflow-visible';

    return cn(baseClasses, {
      'border-2 border-gray-500': processingState === ProcessingState.IDLE && !isSelected,
      'border-2 border-primary-500 ring-2 ring-primary-300 dark:ring-primary-700': isSelected && processingState === ProcessingState.IDLE,
      'animate-pulse border-2 border-blue-500': processingState === ProcessingState.PROCESSING,
      'border-2 border-red-500': processingState === ProcessingState.FAILED,
      'border-2 border-green-500': processingState === ProcessingState.COMPLETED,
      'border-2 border-warning': Boolean(validationError),
      'opacity-60 grayscale border-dashed': !schema.supportedByResource,
    });
  }, [processingState, schema, isSelected, validationError]);

  const targetHandlesWithStyles = useMemo((): { id: string; label?: string; style: React.CSSProperties }[] => {
    return schema.inputs.map((inputName, index) => {
      const totalHandles = schema.inputs.length;
      const leftPercentage = totalHandles === 1 ? 50 : (index / (totalHandles - 1)) * 100;
      return {
        id: inputName,
        label: t('nodes.' + schema.type + '.inputs.' + inputName),
        style: {
          left: `${leftPercentage}%`,
          top: 0,
          transform: 'translate(-50%, -50%)',
        },
      };
    });
  }, [schema, t]);

  const sourceHandlesWithStyles = useMemo((): { id: string; label?: string; style: React.CSSProperties }[] => {
    return schema.outputs.map((outputName, index) => {
      const totalHandles = schema.outputs.length;
      const leftPercentage = totalHandles === 1 ? 50 : (index / (totalHandles - 1)) * 100;
      return {
        id: outputName,
        label: t('nodes.' + schema.type + '.outputs.' + outputName),
        style: {
          left: `${leftPercentage}%`,
          bottom: 0,
          transform: 'translate(-50%, 50%)',
        },
      };
    });
  }, [schema, t]);

  const isEditable = useMemo(() => {
    if (previewMode) {
      return false;
    }

    if (schema.configSchema.dynamic === true) {
      return true;
    }

    const properties = schema.configSchema.properties as Record<string, unknown> | undefined;

    if (!properties || Object.keys(properties).length === 0) {
      return false;
    }

    return true;
  }, [previewMode, schema]);

  const previewRows = useNodePreviewRows({ schema, tNodeTranslations: t });

  // Plugin-contributed node types have no entries in the static i18n JSON files.
  // Fall back to the label/description the plugin declared in its schema definition.
  const titleKey = 'nodes.' + schema.type + '.title';
  const descriptionKey = 'nodes.' + schema.type + '.description';
  const nodeTitle = tNodeExists?.(titleKey) ? t(titleKey) : (schema.label ?? schema.type);
  const nodeDescription = tNodeExists?.(descriptionKey) ? t(descriptionKey) : (schema.description ?? '');

  return (
    <NodeEditor schema={schema} tNodeTranslations={t} tNodeExists={tNodeExists}>
      {(openEditor) => (
        <div>
          <DeleteConfirmationModal
            isOpen={showDeleteConfirmation}
            onClose={userDoesNotWantToDelete}
            onConfirm={remove}
            itemName={nodeTitle}
          />

          <NodeToolbar isVisible={data?.forceToolbarVisible || undefined} position={data?.toolbarPosition}>
            <div className="flex flex-row gap-2">
              {isEditable && (
                <Button isIconOnly onPress={openEditor} ><Edit2Icon size={12} /></Button>
              )}
              {!previewMode && (
                <Button variant="danger" isIconOnly onPress={userWantsToDelete}>
                  <Trash2Icon size={12} />
                </Button>
              )}
            </div>
          </NodeToolbar>
          <div className="relative">
          <Card className={cardClasses} onDoubleClick={isEditable ? openEditor : undefined}>
            <Card.Header className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center min-w-0">
                  <span className="font-bold text-sm truncate">{nodeTitle}</span>
                </div>
                {!previewMode && (
                  <Tooltip>
                    <TooltipTrigger tabIndex={0}>
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          processingState === ProcessingState.PROCESSING
                            ? 'bg-blue-500 animate-pulse'
                            : processingState === ProcessingState.COMPLETED
                              ? 'bg-green-500'
                              : processingState === ProcessingState.FAILED
                                ? 'bg-red-500'
                                : 'bg-default-400',
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {processingState === ProcessingState.PROCESSING
                        ? 'Processing'
                        : processingState === ProcessingState.COMPLETED
                          ? 'Completed'
                          : processingState === ProcessingState.FAILED
                            ? 'Failed'
                            : 'Idle'}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {(previewMode || !isEditable) && nodeDescription && (
                <span className="text-xs text-default-500 text-wrap">{nodeDescription}</span>
              )}
            </Card.Header>

            {!previewMode && previewRows.length > 0 && (
              <Card.Content className="pt-0">
                <div className="flex flex-col gap-2">
                  {previewRows.map((row) => (
                    <div className="flex flex-col gap-1" key={row.label}>
                      <small>{row.label}</small>
                      {'entries' in row ? (
                        row.entries.length === 0 ? (
                          <Code className="text-ellipsis overflow-hidden">-</Code>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {row.entries.map((entry, idx) => (
                              <div
                                key={idx}
                                className="flex flex-col gap-0.5 rounded-md border border-default-200 px-2 py-1"
                              >
                                {entry.fields.map((field) => (
                                  <div
                                    key={field.label}
                                    className="grid grid-cols-[auto_1fr] gap-x-2 items-baseline min-w-0"
                                  >
                                    <small className="text-default-500 whitespace-nowrap">{field.label}</small>
                                    <Code
                                      className="text-ellipsis overflow-hidden whitespace-nowrap min-w-0"
                                      title={field.value}
                                    >
                                      {field.value}
                                    </Code>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )
                      ) : (
                        <Code className="text-ellipsis overflow-hidden" title={row.value}>
                          {row.value}
                        </Code>
                      )}
                    </div>
                  ))}
                </div>
              </Card.Content>
            )}
          </Card>

          {!previewMode &&
            targetHandlesWithStyles.map(({ id: handleId, label, style }) => (
              <div key={handleId} className="absolute z-10" style={style}>
                <Tooltip isDisabled={!label}>
                  <TooltipTrigger tabIndex={0}>
                    <Handle
                      type="target"
                      position={Position.Top}
                      className="!w-4 !h-4"
                      style={{ position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}
                      id={handleId}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              </div>
            ))}

          {!previewMode &&
            sourceHandlesWithStyles.map(({ id: handleId, label, style }) => (
              <div key={handleId} className="absolute z-10" style={style}>
                <Tooltip isDisabled={!label}>
                  <TooltipTrigger tabIndex={0}>
                    <Handle
                      type="source"
                      position={Position.Bottom}
                      className="!w-4 !h-4"
                      style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}
                      id={handleId}
                    />
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>

           {!previewMode && !schema.supportedByResource && (
            <div className="text-xs text-warning-600 dark:text-warning-400 mt-1 px-1 flex flex-row items-center gap-1">
              <TriangleAlertIcon size={12} /> {t('nodes.unsupportedForResourceType')}
            </div>
           )}
           {!previewMode && validationError && (
             <div className="text-xs text-danger mt-1 px-1 flex flex-row items-center gap-1">
               <TriangleAlertIcon size={12} /> {validationError}
             </div>
           )}
        </div>
      )}
    </NodeEditor>
  );
}
