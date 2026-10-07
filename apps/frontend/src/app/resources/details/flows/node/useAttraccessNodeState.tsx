import { ResourceFlowLogType } from '@attraccess/react-query-client';
import { cn, useOverlayState } from '@heroui/react';
import { useNodeId } from '@xyflow/react';
import { useFlowContext } from '../flowContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ResourceFlowLog } from '@attraccess/react-query-client';
import { useNodePreviewRows } from './preview';
import { Props } from './index.props';
import { ProcessingState } from './index.processing-state';
export function useAttraccessNodeState(props: Props) {
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

  const { addLiveLogReceiver, removeLiveLogReceiver, removeNode, resourceId } = useFlowContext();

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

  const { isOpen: showDeleteConfirmation, open: userWantsToDelete, close: userDoesNotWantToDelete } = useOverlayState();

  const isSelected = props.node?.selected ?? false;

  const cardClasses = useMemo(() => {
    const baseClasses = 'bg-surface w-64 overflow-visible';

    return cn(baseClasses, {
      'border-2 border-border': processingState === ProcessingState.IDLE && !isSelected,
      'border-2 border-accent ring-2 ring-accent/30': isSelected && processingState === ProcessingState.IDLE,
      'animate-pulse border-2 border-accent': processingState === ProcessingState.PROCESSING,
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
        label:
          tNodeExists?.('nodes.' + schema.type + '.inputs.' + inputName) !== false
            ? t('nodes.' + schema.type + '.inputs.' + inputName)
            : inputName,
        style: {
          left: `${leftPercentage}%`,
          top: 0,
          transform: 'translate(-50%, -50%)',
        },
      };
    });
  }, [schema, t, tNodeExists]);

  const sourceHandlesWithStyles = useMemo((): { id: string; label?: string; style: React.CSSProperties }[] => {
    return schema.outputs.map((outputName, index) => {
      const totalHandles = schema.outputs.length;
      const leftPercentage = totalHandles === 1 ? 50 : (index / (totalHandles - 1)) * 100;
      return {
        id: outputName,
        label:
          tNodeExists?.('nodes.' + schema.type + '.outputs.' + outputName) !== false
            ? t('nodes.' + schema.type + '.outputs.' + outputName)
            : outputName,
        style: {
          left: `${leftPercentage}%`,
          bottom: 0,
          transform: 'translate(-50%, 50%)',
        },
      };
    });
  }, [schema, t, tNodeExists]);

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

  const previewRows = useNodePreviewRows({ schema, tNodeTranslations: t, resourceId });

  // Plugin-contributed node types have no entries in the static i18n JSON files.
  // Fall back to the label/description the plugin declared in its schema definition.
  const titleKey = 'nodes.' + schema.type + '.title';
  const descriptionKey = 'nodes.' + schema.type + '.description';
  const nodeTitle = tNodeExists?.(titleKey) ? t(titleKey) : (schema.label ?? schema.type);
  const nodeDescription = tNodeExists?.(descriptionKey) ? t(descriptionKey) : (schema.description ?? '');
  return {
    schema,
    previewMode,
    t,
    tNodeExists,
    data,
    validationError,
    processingState,
    remove,
    showDeleteConfirmation,
    userWantsToDelete,
    userDoesNotWantToDelete,
    cardClasses,
    targetHandlesWithStyles,
    sourceHandlesWithStyles,
    isEditable,
    previewRows,
    nodeTitle,
    nodeDescription,
  } as const;
}
