export interface StatusData {
  apiConnected: boolean;
  ipAddress: string;
  readerId: string;
  wifiConnected: boolean;
}

export interface ConfigData {
  apiHostname: string;
  apiPort: string;
  configPagePassword: string;
}

export interface LoginFormData {
  password: string;
}

export interface ThemeContextType {
  isDark: boolean;
  setIsDark: (isDark: boolean) => void;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}
