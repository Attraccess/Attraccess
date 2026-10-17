import { Counter, Gauge, Registry } from 'prom-client';
export function createIdentityMetrics(registry: Registry) {
  const authLoginTotal = new Counter({
    name: 'attraccess_auth_login_total',
    help: 'Total number of login attempts',
    labelNames: ['method', 'status'],
    registers: [registry],
  });

  const authActiveSessions = new Gauge({
    name: 'attraccess_auth_active_sessions',
    help: 'Number of active authenticated sessions',
    registers: [registry],
  });

  const authSsoLoginTotal = new Counter({
    name: 'attraccess_auth_sso_login_total',
    help: 'Total number of successful SSO login attempts',
    labelNames: ['provider_type'],
    registers: [registry],
  });

  const authSsoLoginFailuresTotal = new Counter({
    name: 'attraccess_auth_sso_login_failures_total',
    help: 'Total number of failed SSO login attempts',
    labelNames: ['provider_type', 'reason'],
    registers: [registry],
  });

  const auth2faUsageTotal = new Counter({
    name: 'attraccess_auth_2fa_usage_total',
    help: 'Total number of 2FA actions',
    labelNames: ['action'],
    registers: [registry],
  });

  const usersTotal = new Gauge({
    name: 'attraccess_users_total',
    help: 'Total number of registered users',
    registers: [registry],
  });

  const usersRegisteredTotal = new Counter({
    name: 'attraccess_users_registered_total',
    help: 'Total number of user registrations',
    registers: [registry],
  });

  const usersLocaleSyncsTotal = new Counter({
    name: 'attraccess_users_locale_syncs_total',
    help: 'Total number of user locale sync calls, labelled by locale',
    labelNames: ['locale'],
    registers: [registry],
  });

  const usersPerLocale = new Gauge({
    name: 'attraccess_users_per_locale',
    help: 'Number of users with each locale set',
    labelNames: ['locale'],
    registers: [registry],
  });
  return {
    authLoginTotal,
    authActiveSessions,
    authSsoLoginTotal,
    authSsoLoginFailuresTotal,
    auth2faUsageTotal,
    usersTotal,
    usersRegisteredTotal,
    usersLocaleSyncsTotal,
    usersPerLocale,
  };
}
