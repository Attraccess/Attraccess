import { useAuth } from './useAuth';

export interface TwoFactorGateState {
  shouldShow: boolean;
}

/** The gate shows only when the server requires two-factor authentication for this user and it is not set up. */
export function useTwoFactorGate(): TwoFactorGateState {
  const { isAuthenticated, needsTwoFactorSetup, isTwoFactorStatusLoading } = useAuth();

  return { shouldShow: isAuthenticated && !isTwoFactorStatusLoading && needsTwoFactorSetup };
}
