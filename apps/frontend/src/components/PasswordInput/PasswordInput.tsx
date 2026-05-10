import React, { useState } from 'react';
import { TextFieldProps, TextField, Label, Input, InputGroup, Description, FieldError } from '@heroui/react';
import { Button, Tooltip } from '@heroui/react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './PasswordInput.en.json';
import de from './PasswordInput.de.json';

export interface PasswordInputProps extends Omit<TextFieldProps, 'type' | 'children'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  errorMessage?: React.ReactNode;
  autoComplete: string;
  onValueChange?: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  placeholder?: string;
  'data-cy'?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  description,
  errorMessage,
  onValueChange,
  onChange,
  id,
  name,
  required,
  placeholder,
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
          placeholder={placeholder}
          data-cy={dataCy}
        />
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              variant="ghost"
              isIconOnly

              onPress={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              data-cy="password-input-toggle-button"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{showPassword ? t('hidePassword') : t('showPassword')}</Tooltip.Content>
        </Tooltip>
      </InputGroup>
      {description && <Description>{description}</Description>}
      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </TextField>
  );
};
