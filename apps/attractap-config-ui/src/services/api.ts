import { ApiResponse, ConfigData, LoginFormData, StatusData } from '../types';

const API_BASE_URL = localStorage.getItem('apiBaseUrl') ?? window.location.origin;

// Helper function to handle fetch responses
async function handleResponse<T>(response: Response, expectEmptyResponse = false): Promise<ApiResponse<T>> {
  if (!response.ok) {
    // For network errors and non-2xx responses
    if (response.status === 401) {
      return {
        success: false,
        message: 'Authentication failed',
      };
    }

    if (expectEmptyResponse) {
      return {
        success: true,
      };
    }

    try {
      const errorData = await response.json();
      return errorData as ApiResponse<T>;
    } catch {
      return {
        success: false,
        message: `Request failed with status ${response.status}`,
      };
    }
  }

  const data = await response.json();
  return data as ApiResponse<T>;
}

export async function login(data: LoginFormData): Promise<ApiResponse<boolean>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    return handleResponse<boolean>(response, true);
  } catch {
    return {
      success: false,
      message: 'Network error. Please try again.',
    };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

interface StatusResponse {
  ipAddress: string;
  wifiConnected: boolean;
  apiConnected: boolean;
  readerId: string;
}

export async function getStatus(): Promise<StatusData> {
  const response = await fetch(`${API_BASE_URL}/api/status`, {
    credentials: 'include',
  });

  const data = await handleResponse<StatusResponse>(response).catch(() => {
    return {
      ipAddress: 'Unknown',
      wifiConnected: false,
      readerId: 'Unknown',
      apiConnected: false,
    };
  });

  return data as StatusData;
}

export async function getConfig(): Promise<ConfigData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config`, {
      credentials: 'include',
    });
    const data = await handleResponse<ConfigData>(response);

    if (data.success && data.data) {
      return data.data;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return null;
  }
}

export async function saveConfig(config: ConfigData): Promise<ApiResponse<boolean>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
      credentials: 'include',
    });
    return handleResponse<boolean>(response);
  } catch {
    return {
      success: false,
      message: 'Network error. Please try again.',
    };
  }
}
