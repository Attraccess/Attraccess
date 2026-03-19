import { useCallback, useRef, useState } from 'react';
import { Button, Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, Spinner, Chip, Divider, Tooltip } from '@heroui/react';
import { AlertTriangle, MessageSquarePlus, Copy, Check } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { useAiChatStore } from './ai-chat.store';
import { useAiChat } from './useAiChat';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import en from './translations/en.json';
import de from './translations/de.json';
import { useAiServiceAiControllerGetStatus } from '@attraccess/react-query-client';

const TRANSLATIONS = { en, de };

const SUGGESTED_PROMPT_KEYS = [
  'showResources',
  'checkBilling',
  'howToUse',
  'myUsage',
] as const;

function formatPartForLog(part: Record<string, unknown>): string {
  if (part.type === 'text') return part.text as string;
  if (part.type === 'reasoning') return `[Thinking] ${part.text}`;
  if (String(part.type).startsWith('tool-') || part.type === 'dynamic-tool') {
    const name = (part.toolName || part.type) as string;
    const input = part.input ?? part.args;
    const output = part.output ?? part.result;
    const errorText = part.errorText as string | undefined;
    const state = part.state as string | undefined;
    let block = `[Tool: ${name}] (state: ${state || 'unknown'})\n`;
    if (input) block += `  Input: ${JSON.stringify(input, null, 2)}\n`;
    if (errorText) block += `  Error: ${errorText}\n`;
    if (output !== undefined) block += `  Output: ${JSON.stringify(output, null, 2)}\n`;
    return block;
  }
  return `[${part.type}] ${JSON.stringify(part)}`;
}

function buildChatLog(messages: { role: string; parts?: Record<string, unknown>[] }[]): string {
  return messages.map((msg) => {
    const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
    const parts = (msg.parts || []).map(formatPartForLog).join('\n');
    return `--- ${role} ---\n${parts}`;
  }).join('\n\n');
}

export function AiChatPanel() {
  const { isOpen, setOpen } = useAiChatStore();
  const chat = useAiChat();
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const { t } = useTranslations(TRANSLATIONS);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { data: status } = useAiServiceAiControllerGetStatus(undefined, {
    enabled: isOpen,
    refetchInterval: 10000,
  });

  const isStreaming = chat.status === 'streaming';
  const isBusy = chat.status === 'submitted' || isStreaming;

  const handleSend = useCallback(
    (text: string) => {
      chatRef.current.sendMessage({ text });
    },
    [],
  );

  const handleStop = useCallback(() => {
    chatRef.current.stop();
  }, []);

  const handleNewChat = useCallback(() => {
    chatRef.current.setMessages([]);
  }, []);

  const handleSuggestedPrompt = useCallback(
    (key: string) => {
      const text = t(`aiChat.suggestedPrompts.${key}`);
      chatRef.current.sendMessage({ text });
    },
    [t],
  );

  const handleCopyLog = useCallback(() => {
    const log = buildChatLog(chatRef.current.messages as unknown as { role: string; parts?: Record<string, unknown>[] }[]);
    navigator.clipboard.writeText(log).then(() => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const notReady = status && (!status.ollamaConnected || !status.modelsReady);
  const showSuggestions = chat.messages.length === 0 && !isBusy && !notReady;

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={setOpen}
      placement="right"
      size="md"
      hideCloseButton={false}
    >
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <span>{t('aiChat.title')}</span>
          <div className="flex gap-1">
            <Tooltip content={t('aiChat.copyChatLog')} delay={400}>
              <Button isIconOnly size="sm" variant="light" onPress={handleCopyLog} aria-label={t('aiChat.copyChatLog')} isDisabled={chat.messages.length === 0}>
                {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              </Button>
            </Tooltip>
            <Button isIconOnly size="sm" variant="light" onPress={handleNewChat} aria-label={t('aiChat.newChat')}>
              <MessageSquarePlus size={16} />
            </Button>
          </div>
        </DrawerHeader>
        <DrawerBody className="p-0">
          {notReady && (
            <div className="px-4 py-3 bg-warning-50 dark:bg-warning-900/20 border-b border-warning-200 dark:border-warning-800">
              <div className="flex items-center gap-2 text-sm text-warning-700 dark:text-warning-300">
                {status.modelsPulling ? (
                  <>
                    <Spinner size="sm" />
                    <div>
                      <p className="font-medium">{t('aiChat.downloadingModels')}</p>
                      {status.pullProgress && Object.entries(status.pullProgress).map(([model, progress]) => (
                        <p key={model} className="text-xs mt-1">{model}: {progress}</p>
                      ))}
                    </div>
                  </>
                ) : !status.ollamaConnected ? (
                  <p>{t('aiChat.ollamaNotReachable')}</p>
                ) : (
                  <>
                    <Spinner size="sm" />
                    <p>{t('aiChat.preparingModels')}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {showSuggestions && (
            <div className="flex flex-col items-center gap-3 p-6">
              <p className="text-sm text-default-400">{t('aiChat.emptyState')}</p>
              <Divider className="my-2" />
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_PROMPT_KEYS.map((key) => (
                  <Chip
                    key={key}
                    variant="bordered"
                    className="cursor-pointer hover:bg-default-100"
                    onClick={() => handleSuggestedPrompt(key)}
                  >
                    {t(`aiChat.suggestedPrompts.${key}`)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <ChatMessageList
            messages={chat.messages}
            isLoading={chat.status === 'submitted'}
          />
        </DrawerBody>
        <DrawerFooter className="flex flex-col p-0">
          {chat.error && (
            <div className="px-3 py-2 bg-danger-50 dark:bg-danger-900/20 border-t border-danger-200 dark:border-danger-800">
              <div className="flex items-start gap-2 text-sm text-danger-700 dark:text-danger-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{t('aiChat.error')}</p>
                  <p className="text-xs mt-0.5 break-words">{chat.error.message}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" color="danger" variant="flat" onPress={() => chat.regenerate()}>
                    {t('aiChat.retry')}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <ChatInput
            onSend={handleSend}
            onStop={handleStop}
            disabled={isBusy || !!notReady}
            isStreaming={isStreaming}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
