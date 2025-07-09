import { useCallback, useState, useMemo } from 'react';
import { useLogin, useLogout } from '../services/queries';
import { LoginFormData } from '../types';
import { AuthContext } from './AuthContext';

export function AuthProvider(props: Readonly<React.PropsWithChildren>) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const login = useCallback(
    async (data: LoginFormData): Promise<boolean> => {
      try {
        const response = await loginMutation.mutateAsync(data);

        if (response.success) {
          setIsAuthenticated(true);
          return true;
        } else {
          setIsAuthenticated(false);
          return false;
        }
      } catch {
        setIsAuthenticated(false);
        return false;
      }
    },
    [loginMutation]
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutMutation.mutateAsync();
      setIsAuthenticated(false);
    } catch {
      // Logout failed, but we don't need to update state here
    }
  }, [logoutMutation]);

  const authContextValue = useMemo(() => {
    return {
      isAuthenticated,
      setIsAuthenticated,
      login,
      logout,
    };
  }, [isAuthenticated, login, logout]);

  return <AuthContext.Provider value={authContextValue}>{props.children}</AuthContext.Provider>;
}
