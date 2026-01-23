import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';

export interface TwoFactorGateState {
  shouldShow: boolean;
  needsTwoFactorSetup: boolean;
  canSkip: boolean;
  clearSetupIntent: () => void;
}

export function useTwoFactorGate(): TwoFactorGateState {
  const { isAuthenticated, needsTwoFactorSetup, twoFactorStatus, isTwoFactorStatusLoading } = useAuth();
  const [hasSetupIntent, setHasSetupIntent] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isAuthenticated) {
      setHasSetupIntent(false);
      return;
    }

    setHasSetupIntent(sessionStorage.getItem('twoFactorSetupIntent') === 'true');
  }, [isAuthenticated]);

  const clearSetupIntent = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('twoFactorSetupIntent');
    }
    setHasSetupIntent(false);
  }, []);

  useEffect(() => {
    if (twoFactorStatus?.enabled && hasSetupIntent) {
      clearSetupIntent();
    }
  }, [clearSetupIntent, hasSetupIntent, twoFactorStatus?.enabled]);

  const shouldPromptSetup = hasSetupIntent && !twoFactorStatus?.enabled;
  const shouldShow = isAuthenticated && !isTwoFactorStatusLoading && (needsTwoFactorSetup || shouldPromptSetup);

  return {
    shouldShow,
    needsTwoFactorSetup,
    canSkip: !needsTwoFactorSetup,
    clearSetupIntent,
  };
}
