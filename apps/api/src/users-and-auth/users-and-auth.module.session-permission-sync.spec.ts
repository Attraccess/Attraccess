import { OidcSessionResyncer } from './auth/sso/oidc/oidc-session-resyncer';
import { SESSION_PERMISSION_RESYNCERS, SessionPermissionSync } from './auth/sso/session-permission-sync';
import { SsoSessionPermissionSyncService } from './auth/sso/session-permission-sync.service';
import { UsersAndAuthModule } from './users-and-auth.module';

type ProviderDefinition = {
  provide: unknown;
  useExisting?: unknown;
  useFactory?: (...args: unknown[]) => unknown;
  inject?: unknown[];
};

const findProvider = (token: unknown): ProviderDefinition | undefined =>
  ((Reflect.getMetadata('providers', UsersAndAuthModule) ?? []) as unknown[]).find(
    (candidate): candidate is ProviderDefinition =>
      typeof candidate === 'object' && candidate !== null && (candidate as ProviderDefinition).provide === token,
  );

describe('UsersAndAuthModule SessionPermissionSync wiring', () => {
  // SessionStrategy and AuthController inject SessionPermissionSync with @Optional(),
  // so a missing or empty binding would silently disable session-time SSO re-sync.
  it('binds SessionPermissionSync to the generic re-sync service', () => {
    expect(findProvider(SessionPermissionSync)?.useExisting).toBe(SsoSessionPermissionSyncService);
  });

  it('registers the OIDC resyncer as a session permission resyncer', () => {
    const resyncers = findProvider(SESSION_PERMISSION_RESYNCERS);
    const oidcIndex = resyncers?.inject?.indexOf(OidcSessionResyncer) ?? -1;
    expect(oidcIndex).toBeGreaterThanOrEqual(0);

    const oidc = { protocol: 'OIDC' };
    const args = resyncers?.inject?.map((_, index) => (index === oidcIndex ? oidc : {})) ?? [];
    expect(resyncers?.useFactory?.(...args)).toContain(oidc);
  });
});
