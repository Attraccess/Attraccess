import React, { useState, useCallback } from 'react';
import { Button, Input } from '@heroui/react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');

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
    <div className="flex gap-2 p-3 border-t border-gray-200 dark:border-gray-700">
      <Input
        value={value}
        onValueChange={setValue}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Ask me anything...'}
        disabled={disabled}
        size="sm"
        className="flex-1"
      />
      <Button
        isIconOnly
        color="primary"
        size="sm"
        onPress={handleSend}
        isDisabled={disabled || !value.trim()}
      >
        <Send size={16} />
      </Button>
    </div>
  );
}
