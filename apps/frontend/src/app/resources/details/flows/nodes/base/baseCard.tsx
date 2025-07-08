import { Button, Card, CardBody, CardHeader, cn, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { Handle, NodeToolbar, Position, useNodeId } from '@xyflow/react';
import { Trash2Icon } from 'lucide-react';
import { useFlowContext } from '../../flowContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteConfirmationModal } from '../../../../../../components/deleteConfirmationModal';
import { ResourceFlowLog } from '@attraccess/react-query-client';

interface Props {
  title: string;
  subtitle?: string;
  previewMode?: boolean;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  hasTarget?: boolean;
  hasSource?: boolean;
  data?: {
    forceToolbarVisible?: boolean;
    toolbarPosition?: Position;
  };
  showBodyInPreview?: boolean;
}

enum ProcessingState {
  IDLE = 'idle',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export function BaseNodeCard(props: Props) {
  const {
    showBodyInPreview = false,
    title,
    subtitle,
    previewMode,
    actions,
    children,
    hasTarget,
    hasSource,
    data,
  } = props;

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
    [nodeId]
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

  const [isHovering, setIsHovering] = useState(false);

  const cardClasses = useMemo(() => {
    const baseClasses = 'bg-gray-100 dark:bg-gray-800 w-64 overflow-visible';

    return cn(baseClasses, {
      'border-2 border-gray-500': processingState === ProcessingState.IDLE,
      'animate-pulse border-2 border-blue-500': processingState === ProcessingState.PROCESSING,
      'border-2 border-red-500': processingState === ProcessingState.FAILED,
      'border-2 border-green-500': processingState === ProcessingState.COMPLETED,
    });
  }, [processingState]);

  const handleMouseEnter = useCallback(() => setIsHovering(true), []);
  const handleMouseLeave = useCallback(() => setIsHovering(false), []);

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={userDoesNotWantToDelete}
        onConfirm={remove}
        itemName={title}
      />

      <NodeToolbar isVisible={data?.forceToolbarVisible || isHovering || undefined} position={data?.toolbarPosition}>
        <div className="flex flex-row gap-2">
          {previewMode ? undefined : actions}
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
        <CardHeader className="flex flex-row justify-between">
          <PageHeader noMargin title={title} subtitle={previewMode ? subtitle : undefined} />
        </CardHeader>

        {(!previewMode || showBodyInPreview) && children && <CardBody>{children}</CardBody>}
      </Card>

      {!previewMode && hasTarget && <Handle type="target" position={Position.Top} className="!w-4 !h-4" />}
      {!previewMode && hasSource && <Handle type="source" position={Position.Bottom} className="!w-4 !h-4" />}
    </div>
  );
}
