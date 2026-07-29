import { useState } from 'react';
import { LoginForm } from '../../unauthorized/loginForm';
import { PasswordResetForm } from '../../unauthorized/password-reset/passwordResetForm';

// Login gate shown on kiosk pages until a user authenticates.
export function KioskLogin() {
  const [view, setView] = useState<'login' | 'forgot'>('login');

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {view === 'login' && <LoginForm onNeedsAccount={null} onForgotPassword={() => setView('forgot')} />}
      {view === 'forgot' && <PasswordResetForm onGoBack={() => setView('login')} />}
    </div>
  );
}
