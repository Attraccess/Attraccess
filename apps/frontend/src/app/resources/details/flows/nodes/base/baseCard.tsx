import { Badge, Button, Card, CardBody, CardHeader, useDisclosure } from '@heroui/react';
import { PageHeader } from '../../../../../../components/pageHeader';
import { Handle, NodeProps, NodeToolbar, Position, useNodeId } from '@xyflow/react';
import { Trash2Icon } from 'lucide-react';
import { useFlowContext } from '../../flowContext';
import { useCallback } from 'react';
import { DeleteConfirmationModal } from '../../../../../../components/deleteConfirmationModal';

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
}

export function BaseNodeCard(props: Props & NodeProps) {
  const { removeNode } = useFlowContext();
  const nodeId = useNodeId();

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

  return (
    <div>
      <DeleteConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={userDoesNotWantToDelete}
        onConfirm={remove}
        itemName={props.title}
      />

      <NodeToolbar isVisible={props.data?.forceToolbarVisible || undefined} position={props.data?.toolbarPosition}>
        <div className="flex flex-row gap-2">
          {props.previewMode ? undefined : props.actions}
          {!props.previewMode && (
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
      <Card className="bg-gray-100 dark:bg-gray-800 w-64 overflow-visible">
        <CardHeader className="flex flex-row justify-between">
          <PageHeader noMargin title={props.title} subtitle={props.previewMode ? props.subtitle : undefined} />
        </CardHeader>

        {props.children && <CardBody>{props.children}</CardBody>}
      </Card>

      {!props.previewMode && props.hasTarget && <Handle type="target" position={Position.Top} className="!w-4 !h-4" />}
      {!props.previewMode && props.hasSource && (
        <Handle type="source" position={Position.Bottom} className="!w-4 !h-4" />
      )}
    </div>
  );
}
