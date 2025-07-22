import { useAuth } from './useAuth';

// Mock all dependencies to avoid complex setup issues
jest.mock('../api', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('@attraccess/react-query-client', () => ({
  OpenAPI: { BASE: '', TOKEN: '', WITH_CREDENTIALS: false },
  useUsersServiceGetCurrent: () => ({ data: null }),
  useAuthenticationServiceEndSession: () => ({ mutate: jest.fn() }),
  useAuthenticationServiceRefreshSession: () => ({ data: null }),
  useAuthenticationServiceCreateSession: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: jest.fn(), mutateAsync: jest.fn() }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

describe('useAuth', () => {
  it('should be defined', () => {
    expect(useAuth).toBeDefined();
  });

  it('should be a function', () => {
    expect(typeof useAuth).toBe('function');
  });
});