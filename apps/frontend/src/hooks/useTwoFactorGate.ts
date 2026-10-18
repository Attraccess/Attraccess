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

    try {
      setHasSetupIntent(sessionStorage.getItem('twoFactorSetupIntent') === 'true');
    } catch {
      // Optional setup intent must not prevent the mandatory server-driven gate.
      setHasSetupIntent(false);
    }
  }, [isAuthenticated]);

  const clearSetupIntent = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem('twoFactorSetupIntent');
      } catch {
        // Clearing the in-memory intent still works without browser storage.
      }
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
