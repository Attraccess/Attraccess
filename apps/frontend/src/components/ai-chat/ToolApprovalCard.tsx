import React from 'react';
import { Button, Card, CardBody, Chip, Code } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { ToolCallInfo } from './ai-chat.store';
import en from './translations/en.json';
import de from './translations/de.json';

interface ToolApprovalCardProps {
  toolCall: ToolCallInfo;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function ToolApprovalCard({ toolCall, onApprove, onReject }: ToolApprovalCardProps) {
  const isPending = toolCall.status === 'pending';
  const isExecuted = toolCall.status === 'executed';
  const isRejected = toolCall.status === 'rejected';
  const { t } = useTranslations({ en, de });

  return (
    <Card className="mb-3" shadow="sm">
      <CardBody className="p-3 gap-2">
        <div className="flex items-center gap-2">
          <Chip
            size="sm"
            color={isExecuted ? 'success' : isRejected ? 'danger' : 'warning'}
            variant="flat"
          >
            {isExecuted ? t('aiChat.toolResult') : isRejected ? t('aiChat.rejected') : t('aiChat.toolCall')}
          </Chip>
        </div>
        <p className="text-sm font-medium">{toolCall.name}</p>
        {Object.keys(toolCall.parameters).length > 0 && (
          <Code className="text-xs overflow-x-auto whitespace-pre-wrap block p-2">
            {JSON.stringify(toolCall.parameters, null, 2)}
          </Code>
        )}
        {toolCall.result !== undefined && (
          <Code className="text-xs overflow-x-auto whitespace-pre-wrap block p-2" color="success">
            {JSON.stringify(toolCall.result, null, 2)}
          </Code>
        )}
        {isPending && (
          <div className="flex gap-2 mt-1">
            <Button size="sm" color="success" variant="flat" onPress={() => onApprove(toolCall.id)}>
              {t('aiChat.approve')}
            </Button>
            <Button size="sm" color="danger" variant="flat" onPress={() => onReject(toolCall.id)}>
              {t('aiChat.reject')}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
