import React, { useState } from 'react';
import { Input, InputProps } from '@heroui/input';
import { Button } from '@heroui/button';
import { Tooltip } from '@heroui/tooltip';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './PasswordInput.en.json';
import de from './PasswordInput.de.json';

// Omit 'type' from InputProps since we always want it to be 'password' or 'text'
export interface PasswordInputProps extends Omit<InputProps, 'type' | 'endContent'> {
  /**
   * Custom end content to append after the visibility toggle button.
   * If provided, it will be rendered after the eye icon.
   */
  additionalEndContent?: React.ReactNode;
}

/**
 * A password input component with built-in visibility toggle functionality.
 * This is a drop-in replacement for HeroUI Input components when type="password" is needed.
 *
 * Features:
 * - Eye/EyeOff icon toggle for password visibility
 * - Internationalized tooltips
 * - Consistent styling with HeroUI components
 * - All standard Input props supported
 */
export const PasswordInput: React.FC<PasswordInputProps & Required<Pick<InputProps, 'autoComplete'>>> = ({
  additionalEndContent,
  ...inputProps
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslations({ en, de });

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const endContent = (
    <div className="flex items-center gap-1">
      <Tooltip content={showPassword ? t('hidePassword') : t('showPassword')}>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={togglePasswordVisibility}
          aria-label={showPassword ? t('hidePassword') : t('showPassword')}
          data-cy="password-input-toggle-button"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
      </Tooltip>
      {additionalEndContent}
    </div>
  );

  return <Input {...inputProps} type={showPassword ? 'text' : 'password'} endContent={endContent} />;
};
