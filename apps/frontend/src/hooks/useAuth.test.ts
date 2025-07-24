import { vi } from 'vitest';
import { useAuth } from './useAuth';

// Mock all dependencies to avoid complex setup issues
vi.mock('../api', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@attraccess/react-query-client', () => ({
  OpenAPI: { BASE: '', TOKEN: '', WITH_CREDENTIALS: false },
  useUsersServiceGetCurrent: () => ({ data: null }),
  useAuthenticationServiceEndSession: () => ({ mutate: vi.fn() }),
  useAuthenticationServiceRefreshSession: () => ({ data: null }),
  useAuthenticationServiceCreateSession: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe('useAuth', () => {
  it('should be defined', () => {
    expect(useAuth).toBeDefined();
  });

  it('should be a function', () => {
    expect(typeof useAuth).toBe('function');
  });
});
