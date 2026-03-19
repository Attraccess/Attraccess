import React, { useEffect, useRef, useState } from 'react';
import { Card, CardBody, Chip, Code } from '@heroui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import type { UIMessage } from 'ai';
import { JsonRenderBlock } from './json-render/JsonRenderBlock';
import en from './translations/en.json';
import de from './translations/de.json';

const TRANSLATIONS = { en, de };
const REMARK_PLUGINS = [remarkGfm];

const MD_COMPONENTS = {
  code({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
    const match = /language-json-render/.exec(className || '');
    if (match) {
      const jsonStr = String(children).replace(/\n$/, '');
      return <JsonRenderBlock jsonString={jsonStr} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
};

interface ChatMessageProps {
  message: UIMessage;
}

function ThinkingBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const { t } = useTranslations(TRANSLATIONS);

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

function hasToolError(part: Record<string, unknown>): boolean {
  if (part.state === 'output-error') return true;
  if (part.errorText) return true;
  const output = part.output ?? part.result;
  if (!output || typeof output !== 'object') return false;
  const r = output as Record<string, unknown>;
  return ('error' in r && !!r.error) || ('success' in r && r.success === false);
}

function getToolName(part: Record<string, unknown>): string {
  if (part.toolName) return part.toolName as string;
  const type = part.type as string;
  if (type.startsWith('tool-')) return type.slice(5);
  return type;
}

function getToolState(part: Record<string, unknown>): { isRunning: boolean; isDone: boolean } {
  const state = part.state as string | undefined;
  const isDone = state === 'output-available' || state === 'output-error' || state === 'output-denied' || state === 'result';
  const isRunning = !isDone;
  return { isRunning, isDone };
}

function ToolCallPart({ part }: { part: Record<string, unknown> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslations(TRANSLATIONS);

  const toolName = getToolName(part);
  const isError = hasToolError(part);
  const { isRunning, isDone } = getToolState(part);
  const input = part.input ?? part.args;
  const output = part.output ?? part.result;
  const errorText = part.errorText as string | undefined;

  const statusColor = isError ? 'danger' : isDone ? 'success' : 'warning';
  const statusLabel = isError ? t('aiChat.toolError') : isDone ? t('aiChat.toolResult') : isRunning ? t('aiChat.toolRunning') : t('aiChat.toolCall');

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
        <span className="font-mono text-default-600 truncate">{toolName}</span>
        <span className="ml-auto text-[10px] text-default-400">{isExpanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1">
          {input != null && Object.keys(input as object).length > 0 && (
            <Code className="text-[11px] overflow-x-auto whitespace-pre-wrap block p-1.5">
              {JSON.stringify(input, null, 2)}
            </Code>
          )}
          {errorText && (
            <Code className="text-[11px] overflow-x-auto whitespace-pre-wrap block p-1.5" color="danger">
              {errorText}
            </Code>
          )}
          {output !== undefined && (
            <Code className="text-[11px] overflow-x-auto whitespace-pre-wrap block p-1.5" color={isError ? 'danger' : 'success'}>
              {JSON.stringify(output, null, 2)}
            </Code>
          )}
        </div>
      )}
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const parts = message.parts || [];

  if (isUser) {
    const textContent = parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || '';

    return (
      <div className="flex justify-end mb-3">
        <Card className="max-w-[85%] bg-primary text-primary-foreground" shadow="sm" radius="lg">
          <CardBody className="px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap">{textContent}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3">
      <Card className="max-w-[85%]" shadow="sm" radius="lg">
        <CardBody className="px-3 py-2 text-sm">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {parts.map((part: any, index: number) => {
            if (part.type === 'reasoning') {
              return (
                <ThinkingBlock
                  key={`reasoning-${index}`}
                  content={part.text}
                  isStreaming={part.state === 'streaming'}
                />
              );
            }
            if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
              return <ToolCallPart key={part.toolCallId || `tool-${index}`} part={part} />;
            }
            if (part.type === 'text' && part.text) {
              return <TextBlock key={`text-${index}`} text={part.text} />;
            }
            return null;
          })}
        </CardBody>
      </Card>
    </div>
  );
}
