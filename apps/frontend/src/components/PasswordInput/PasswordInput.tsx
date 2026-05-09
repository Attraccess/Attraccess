import React, { useState } from 'react';
import { TextFieldProps, TextField, Label, Input, InputGroup, Description } from '@heroui/react';
import { Button } from '@heroui/react';
import { Tooltip } from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './PasswordInput.en.json';
import de from './PasswordInput.de.json';

export interface PasswordInputProps extends Omit<TextFieldProps, 'type' | 'children'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  autoComplete: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  'data-cy'?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  description,
  onValueChange,
  onChange,
  id,
  name,
  required,
  'data-cy': dataCy,
  ...fieldProps
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslations({ en, de });

  const handleChange = (v: string) => {
    onChange?.(v);
    onValueChange?.(v);
  };

  return (
    <TextField {...fieldProps} onChange={handleChange}>
      {label && <Label>{label}</Label>}
      <InputGroup>
        <Input
          type={showPassword ? 'text' : 'password'}
          id={id}
          name={name}
          required={required}
          data-cy={dataCy}
        />
        <Tooltip content={showPassword ? t('hidePassword') : t('showPassword')}>
          <Button
            variant="ghost"
            isIconOnly
            size="sm"
            onPress={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            data-cy="password-input-toggle-button"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </Tooltip>
      </InputGroup>
      {description && <Description>{description}</Description>}
    </TextField>
  );
};
