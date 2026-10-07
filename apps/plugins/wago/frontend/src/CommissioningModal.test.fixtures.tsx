import { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { SetupScope } from './CommissioningModal.test';
import { fireEvent, screen } from '@testing-library/react';

export function resetTestFixture(scope: SetupScope) {
  scope.client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } });
  scope.requests = [];
  scope.failInstall = false;
  scope.failRecovery = false;
  scope.activeSession = { ...scope.session };
  scope.verificationControllerId = null;
  scope.verificationOverrides = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      scope.requests.push({ url, body: options?.body as string | undefined });
      const isInstall = url.endsWith('/deliver');
      const isRecovery = url.endsWith('/recover');
      const data =
        isInstall || isRecovery
          ? scope.activeSession
          : url.endsWith('/management')
            ? null
            : url.endsWith('/operation')
              ? { state: 'available' }
              : url.endsWith('/verification')
                ? {
                    controllerId: scope.verificationControllerId,
                    permanentConnection: false,
                    enrollmentRevoked: false,
                    configurationApplied: false,
                    ...scope.verificationOverrides,
                  }
                : url.includes('/commissioning/sessions')
                  ? [scope.activeSession]
                  : url.endsWith('/settings')
                    ? { defaultMqttServerId: 1 }
                    : [];
      return {
        ok: !(isInstall && scope.failInstall) && !(isRecovery && scope.failRecovery),
        status: 400,
        json: async () => ({ message: isRecovery ? 'Runtime snapshot unavailable' : 'Installation failed' }),
        text: async () => JSON.stringify(data),
      };
    }),
  );
}

export function fillCredentials() {
  if (!screen.queryByLabelText('Temporary SSH username'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Use a different SSH login' })[0]);
  fireEvent.change(screen.getByLabelText('Temporary SSH username'), { target: { value: 'operator' } });
  fireEvent.change(screen.getByLabelText('Temporary SSH password'), { target: { value: 'test-only-password' } });
}

export function fillRecoveryCredentials() {
  if (!screen.queryByLabelText('Recovery SSH username')) {
    const switches = screen.getAllByRole('button', { name: 'Use a different SSH login' });
    fireEvent.click(switches[switches.length - 1]);
  }
  fireEvent.change(screen.getByLabelText('Recovery SSH username'), { target: { value: 'recovery-operator' } });
  fireEvent.change(screen.getByLabelText('Recovery SSH password'), { target: { value: 'recovery-secret' } });
}
