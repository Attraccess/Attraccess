import React, { useState, useCallback } from 'react';
import { Button, Textarea } from '@heroui/react';
import { Send } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './translations/en.json';
import de from './translations/de.json';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const { t } = useTranslations({ en, de });

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
        disabled={disabled}
        size="sm"
        minRows={1}
        maxRows={4}
        className="flex-1"
      />
      <Button
        isIconOnly
        color="primary"
        size="sm"
        onPress={handleSend}
        isDisabled={disabled || !value.trim()}
        aria-label={t('aiChat.send')}
      >
        <Send size={16} />
      </Button>
    </div>
  );
}
