import React, { useState, useCallback } from 'react';
import { Button, Textarea } from '@heroui/react';
import { Send, Square } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';

const TRANSLATIONS = { en, de };

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isStreaming }: ChatInputProps) {
  const [value, setValue] = useState('');
  const { t } = useTranslations(TRANSLATIONS);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex gap-2 p-3 w-full">
      <Textarea
        value={value}
        onValueChange={setValue}
        onKeyDown={handleKeyDown}
        placeholder={t('aiChat.inputPlaceholder')}
        disabled={disabled || isStreaming}
        size="sm"
        minRows={1}
        maxRows={4}
        className="flex-1"
      />
      {isStreaming ? (
        <Button
          isIconOnly
          color="danger"
          size="sm"
          variant="flat"
          onPress={onStop}
          aria-label={t('aiChat.stop')}
          data-testid="ai-chat-stop"
        >
          <Square size={16} />
        </Button>
      ) : (
        <Button
          isIconOnly
          color="primary"
          size="sm"
          onPress={handleSend}
          isDisabled={disabled || !value.trim()}
          aria-label={t('aiChat.send')}
          data-testid="ai-chat-send"
        >
          <Send size={16} />
        </Button>
      )}
    </div>
  );
}
