import React, { PropsWithChildren } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/toastProvider';
import { Providers } from '@attraccess/ui';

// Create a new QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface TestWrapperProps extends PropsWithChildren {
  initialRoute?: string;
  routes?: React.ReactNode;
}

/**
 * A wrapper component that provides common test context providers
 * - Router with optional routes and initial route
 * - Query client for data fetching
 * - Toast provider for notifications
 */
export function TestWrapper({ children, initialRoute = '/', routes }: TestWrapperProps) {
  const queryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Providers>
          <ToastProvider>
            {routes ? (
              <Routes>{routes}</Routes>
            ) : (
              <Routes>
                <Route path={initialRoute} element={children} />
              </Routes>
            )}
          </ToastProvider>
        </Providers>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/**
 * A wrapper component that provides only the query client context
 * Useful for testing hooks that use react-query
 */
export function QueryWrapper({ children }: PropsWithChildren) {
  const queryClient = createTestQueryClient();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/**
 * A wrapper component that provides only the router context
 * Useful for testing components that use routing functionality
 */
export function RouterWrapper({ children, initialRoute = '/', routes }: TestWrapperProps) {
  return <MemoryRouter initialEntries={[initialRoute]}>{routes ? <Routes>{routes}</Routes> : children}</MemoryRouter>;
}

/**
 * A wrapper component that provides only the toast context
 * Useful for testing components that use toast notifications
 */
export function ToastWrapper({ children }: PropsWithChildren) {
  return (
    <Providers>
      <ToastProvider>{children}</ToastProvider>
    </Providers>
  );
}
