import { memo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RegistrationForm } from './registrationForm';
import { LoginForm } from './loginForm';
import { UnauthorizedLayout } from './unauthorized-layout/layout';
import { SSOLogin } from './ssoLogin';
import { PasswordResetForm } from './password-reset/passwordResetForm';
import { useSettingsServiceGetFirstTimeSetupStatus } from '@attraccess/react-query-client';

export const Unauthorized = memo(function UnauthorizedComponent() {
  const [formToShow, setFormToShow] = useState<'login' | 'register' | 'forgotPassword'>('login');
  const navigate = useNavigate();

  const { data: setupStatus, isLoading: isCheckingSetup } = useSettingsServiceGetFirstTimeSetupStatus();

  useEffect(() => {
    if (!isCheckingSetup && setupStatus?.available) {
      navigate('/first-time-setup', { replace: true });
    }
  }, [isCheckingSetup, navigate, setupStatus?.available]);

  return (
    <UnauthorizedLayout>
      {formToShow === 'login' && (
        <LoginForm
          onNeedsAccount={() => setFormToShow('register')}
          onForgotPassword={() => setFormToShow('forgotPassword')}
        />
      )}
      {formToShow === 'register' && <RegistrationForm onHasAccount={() => setFormToShow('login')} />}
      {formToShow === 'forgotPassword' && <PasswordResetForm onGoBack={() => setFormToShow('login')} />}
      <SSOLogin />
    </UnauthorizedLayout>
  );
});

Unauthorized.displayName = 'Unauthorized';
