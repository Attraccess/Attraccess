import React, { useEffect, useRef, useState } from 'react';
import { Card, CardBody, Chip, Code } from '@heroui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { UIMessage } from 'ai';
import { JsonRenderBlock } from './json-render/JsonRenderBlock';
import en from './translations/en.json';
import de from './translations/de.json';

interface ChatMessageProps {
  message: UIMessage;
}

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const { t } = useTranslations({ en, de });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
      userScrolledRef.current = !isAtBottom;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [isExpanded]);

  useEffect(() => {
    if (isStreaming && scrollRef.current && !userScrolledRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  if (!content) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-default-400 hover:text-default-600 transition-colors cursor-pointer"
      >
        {isStreaming && <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />}
        <span>{isStreaming ? t('aiChat.thinkingLabel') : t('aiChat.thoughtProcess')}</span>
        <span className="text-[10px]">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isExpanded && (
        <div
          ref={scrollRef}
          className="mt-1 pl-2 border-l-2 border-default-200 text-xs text-default-400 whitespace-pre-wrap max-h-[3em] overflow-y-auto"
        >
          {content}
        </div>
      )}
    </div>
  );
}

function hasToolError(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return ('error' in r && !!r.error) || ('success' in r && r.success === false);
}

function ToolCallPart({ part }: {
  part: { type: string; toolCallId: string; toolName: string; args?: unknown; state?: string; result?: unknown };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslations({ en, de });

  const isResult = part.state === 'result';
  const isError = isResult && hasToolError(part.result);
  const isRunning = part.state === 'call' || part.state === 'partial-call';
  const statusColor = isError ? 'danger' : isResult ? 'success' : 'warning';
  const statusLabel = isError ? t('aiChat.toolError') : isResult ? t('aiChat.toolResult') : isRunning ? t('aiChat.toolRunning') : t('aiChat.toolCall');

  return (
    <div className={`my-1.5 rounded-lg bg-default-50 border overflow-hidden ${isError ? 'border-danger-300' : 'border-default-200'}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs cursor-pointer hover:bg-default-100 transition-colors"
      >
        {isRunning && <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />}
        <Chip size="sm" color={statusColor} variant="flat" className="h-5">
          {statusLabel}
        </Chip>
        <span className="font-mono text-default-600 truncate">{part.toolName}</span>
        <span className="ml-auto text-[10px] text-default-400">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1">
          {!!part.args && Object.keys(part.args as object).length > 0 && (
            <Code className="text-[11px] overflow-x-auto whitespace-pre-wrap block p-1.5">
              {JSON.stringify(part.args, null, 2)}
            </Code>
          )}
          {part.result !== undefined && (
            <Code className="text-[11px] overflow-x-auto whitespace-pre-wrap block p-1.5" color={isError ? 'danger' : 'success'}>
              {JSON.stringify(part.result, null, 2)}
            </Code>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  const textContent = message.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('') || '';

  const reasoningParts = message.parts?.filter((p): p is { type: 'reasoning'; text: string; state?: 'streaming' | 'done' } => p.type === 'reasoning') || [];
  const reasoningText = reasoningParts.map((p) => p.text).join('');
  const isReasoningStreaming = reasoningParts.some((p) => p.state === 'streaming');

  const toolParts = message.parts?.filter((p) => p.type.startsWith('tool-')) || [];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <Card
        className={`max-w-[85%] ${isUser ? 'bg-primary text-primary-foreground' : ''}`}
        shadow="sm"
        radius="lg"
      >
        <CardBody className="px-3 py-2 text-sm">
          {isUser ? (
            <p className="whitespace-pre-wrap">{textContent}</p>
          ) : (
            <>
              {reasoningText && (
                <ThinkingBlock content={reasoningText} isStreaming={isReasoningStreaming} />
              )}
              {toolParts.map((part) => {
                const tp = part as unknown as { type: string; toolCallId: string; toolName: string; args?: unknown; state?: string; result?: unknown };
                return <ToolCallPart key={tp.toolCallId} part={tp} />;
              })}
              {textContent && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-json-render/.exec(className || '');
                        if (match) {
                          const jsonStr = String(children).replace(/\n$/, '');
                          return <JsonRenderBlock jsonString={jsonStr} />;
                        }
                        return <code className={className} {...props}>{children}</code>;
                      },
                    }}
                  >
                    {textContent}
                  </Markdown>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
