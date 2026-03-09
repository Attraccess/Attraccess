import React from 'react';
import { Button, Card, CardBody } from '@heroui/react';
import { ToolCallInfo } from './ai-chat.store';

interface ToolApprovalCardProps {
  toolCall: ToolCallInfo;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ToolApprovalCard({ toolCall, onApprove, onReject }: ToolApprovalCardProps) {
  const isPending = toolCall.status === 'pending';
  const isExecuted = toolCall.status === 'executed';
  const isRejected = toolCall.status === 'rejected';

  return (
    <Card className="mb-3 mx-2" shadow="sm">
      <CardBody className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
            {isExecuted ? 'Executed' : isRejected ? 'Rejected' : 'Proposed Action'}
          </span>
        </div>
        <p className="text-sm font-medium mb-1">{toolCall.name}</p>
        {Object.keys(toolCall.parameters).length > 0 && (
          <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 mb-2 overflow-x-auto">
            {JSON.stringify(toolCall.parameters, null, 2)}
          </pre>
        )}
        {toolCall.result !== undefined && (
          <pre className="text-xs bg-green-50 dark:bg-green-900/20 rounded p-2 mb-2 overflow-x-auto">
            {JSON.stringify(toolCall.result, null, 2)}
          </pre>
        )}
        {isPending && (
          <div className="flex gap-2 mt-2">
            <Button size="sm" color="success" variant="flat" onPress={() => onApprove(toolCall.id)}>
              Approve
            </Button>
            <Button size="sm" color="danger" variant="flat" onPress={() => onReject(toolCall.id)}>
              Reject
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
