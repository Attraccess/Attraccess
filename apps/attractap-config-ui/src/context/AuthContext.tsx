import { createContext } from 'react';
import { LoginFormData } from '../types';

export interface AuthContextType {
  login: (data: LoginFormData) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
