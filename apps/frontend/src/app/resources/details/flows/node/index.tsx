import { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { NodeProps } from '@xyflow/react';
import { TFunction } from 'i18next';
import { Button, Card, CardBody, CardHeader, cn, Code, Tooltip, useDisclosure } from '@heroui/react';
import { Handle, NodeToolbar, Position, useNodeId } from '@xyflow/react';
import { Edit2Icon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useFlowContext } from '../flowContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteConfirmationModal } from '../../../../../components/deleteConfirmationModal';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useNodePreviewRows } from './preview';
import { NodeEditor } from './editor';

interface Props {
  tNodeTranslations: TFunction;
  schema: ResourceFlowNodeSchemaDto;
  node?: NodeProps;
  previewMode?: boolean;
  data?: {
    forceToolbarVisible?: boolean;
    toolbarPosition?: Position;
  };
}

enum ProcessingState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export function AttraccessNode(props: Props) {
  const { schema, previewMode, tNodeTranslations: t, data } = props;

  const { removeNode } = useFlowContext();
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
        case 'node.processing.started':
          setProcessingState(ProcessingState.PROCESSING);
          break;
        case 'node.processing.completed':
          setProcessingState(ProcessingState.COMPLETED);
          break;
        case 'node.processing.failed':
          setProcessingState(ProcessingState.FAILED);
          break;
      }
    },
    [nodeId],
  );

  const { addLiveLogReceiver, removeLiveLogReceiver } = useFlowContext();

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
    onOpen: userWantsToDelete,
    onClose: userDoesNotWantToDelete,
  } = useDisclosure();

  const cardClasses = useMemo(() => {
    const baseClasses = 'bg-gray-100 dark:bg-gray-800 w-64 overflow-visible';

    return cn(baseClasses, {
      'border-2 border-gray-500': processingState === ProcessingState.IDLE,
      'animate-pulse border-2 border-blue-500': processingState === ProcessingState.PROCESSING,
      'border-2 border-red-500': processingState === ProcessingState.FAILED,
      'border-2 border-green-500': processingState === ProcessingState.COMPLETED,
      'opacity-60 grayscale border-dashed': !schema.supportedByResource,
    });
  }, [processingState, schema]);

  const targetHandlesWithStyles = useMemo((): { id: string; label?: string; style: React.CSSProperties }[] => {
    return schema.inputs.map((inputName, index) => {
      const totalHandles = schema.inputs.length;
      const leftPercentage = totalHandles === 1 ? 50 : (index / (totalHandles - 1)) * 100;
      return {
        id: inputName,
        label: t('nodes.' + schema.type + '.inputs.' + inputName),
        style: {
          left: `${leftPercentage}%`,
          top: '-15px',
          transform: 'translateX(-50%)',
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
          bottom: '-15px',
          transform: 'translateX(-50%)',
        },
      };
    });
  }, [schema, t]);

  const actions = useMemo(() => {
    if (previewMode) {
      return undefined;
    }

    const properties = schema.configSchema.properties as Record<string, unknown>;

    if (Object.keys(properties).length === 0) {
      return undefined;
    }

    return (
      <NodeEditor schema={schema} tNodeTranslations={t}>
        {(onOpen) => <Button size="sm" isIconOnly startContent={<Edit2Icon size={12} />} onPress={onOpen} />}
      </NodeEditor>
    );
  }, [previewMode, schema, t]);

  const previewRows = useNodePreviewRows({ schema, tNodeTranslations: t });

  return (
    <div>
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={userDoesNotWantToDelete}
        onConfirm={remove}
        itemName={t('nodes.' + schema.type + '.title')}
      />

      <NodeToolbar isVisible={data?.forceToolbarVisible || undefined} position={data?.toolbarPosition}>
        <div className="flex flex-row gap-2">
          {actions}
          {!previewMode && (
            <Button
              isIconOnly
              color="danger"
              size="sm"
              startContent={<Trash2Icon size={12} />}
              onPress={userWantsToDelete}
            />
          )}
        </div>
      </NodeToolbar>
      <Card className={cardClasses}>
        <CardHeader className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center min-w-0">
              <span className="font-bold text-sm truncate">{t('nodes.' + schema.type + '.title')}</span>
            </div>
            {!previewMode && (
              <Tooltip
                content={
                  processingState === ProcessingState.PROCESSING
                    ? 'Processing'
                    : processingState === ProcessingState.COMPLETED
                      ? 'Completed'
                      : processingState === ProcessingState.FAILED
                        ? 'Failed'
                        : 'Idle'
                }
              >
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
              </Tooltip>
            )}
          </div>
          {previewMode && (
            <span className="text-xs text-default-500 text-wrap">{t('nodes.' + schema.type + '.description')}</span>
          )}
        </CardHeader>

        {!previewMode && previewRows.length > 0 && (
          <CardBody className="pt-0">
            <div className="flex flex-col gap-2">
              {previewRows.map((row) => (
                <div className="flex flex-col gap-2">
                  <small>{row.label}</small>
                  <Code className="text-ellipsis overflow-hidden" title={row.value}>
                    {row.value}
                  </Code>
                </div>
              ))}
            </div>
          </CardBody>
        )}
      </Card>

      {!previewMode && !schema.supportedByResource && (
        <div className="text-xs text-warning-600 dark:text-warning-400 mt-1 px-1 flex flex-row items-center gap-1">
          <TriangleAlertIcon size={12} /> {t('nodes.unsupportedForResourceType')}
        </div>
      )}

      {!previewMode &&
        targetHandlesWithStyles.map(({ id: handleId, label, style }) => (
          <Tooltip content={label} key={handleId} isDisabled={!label}>
            <Handle
              key={handleId}
              type="target"
              position={Position.Top}
              className="!w-4 !h-4"
              style={style}
              id={handleId}
            />
          </Tooltip>
        ))}
      <div style={{ position: 'relative', marginInline: '25px' }}>
        {!previewMode &&
          sourceHandlesWithStyles.map(({ id: handleId, label, style }) => (
            <Tooltip content={label} key={handleId} isDisabled={!label}>
              <Handle style={style} type="source" position={Position.Bottom} className="!w-4 !h-4" id={handleId} />
            </Tooltip>
          ))}
      </div>
    </div>
  );
}
