import React from 'react';
import { Card, CardBody } from '@heroui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from './ai-chat.store';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <Card
        className={`max-w-[85%] ${isUser ? 'bg-primary text-primary-foreground' : ''}`}
        shadow="sm"
        radius="lg"
      >
        <CardBody className="px-3 py-2 text-sm">
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
