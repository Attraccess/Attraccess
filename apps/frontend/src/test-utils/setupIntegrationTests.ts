import { mockToastHooks } from './mocks';
import { vi } from 'vitest';

vi.mock('../components/toastProvider', () => ({
  __esModule: true,
  ToastProvider: mockToastHooks.ToastProvider,
  useToastMessage: mockToastHooks.useToastMessage,
}));

// Mock auth hook
vi.mock('../hooks/useAuth', () => ({
  __esModule: true,
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: '1', email: 'test@example.com' },
  }),
}));

// Mock theme hook
vi.mock('@heroui/use-theme', () => ({
  __esModule: true,
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));

// Mock the API module to handle import.meta
vi.mock('../api/index', () => ({
  __esModule: true,
  default: {
    baseUrl: 'http://localhost:3000',
  },
  filenameToUrl: (filename: string) => `http://localhost:3000/resources/images/${filename}`,
}));
