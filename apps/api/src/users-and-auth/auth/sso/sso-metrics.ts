import { Logger } from '@nestjs/common';
import { SSOProviderType } from '@attraccess/database-entities';
import { MetricsService } from '../../../metrics/metrics.service';

export type SSOLoginFailureReason = 'guard_rejected' | 'invalid_assertion' | 'linking_failed' | 'provider_error';

const SSO_FAILURE_METRIC_RECORDED = Symbol.for('attraccess.ssoFailureMetricRecorded');

export function markSsoFailureMetricRecorded(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    Object.defineProperty(error, SSO_FAILURE_METRIC_RECORDED, {
      configurable: true,
      value: true,
    });
  }
}

export function isSsoFailureMetricRecorded(error: unknown): boolean {
  return Boolean(
    typeof error === 'object' &&
    error !== null &&
    (error as { [SSO_FAILURE_METRIC_RECORDED]?: boolean })[SSO_FAILURE_METRIC_RECORDED],
  );
}

export function providerTypeLabel(providerType: SSOProviderType | string): 'oidc' | 'saml' {
  return providerType.toString().toLowerCase() === SSOProviderType.SAML.toLowerCase() ? 'saml' : 'oidc';
}

export function recordSsoLoginFailure(
  metricsService: Pick<MetricsService, 'authSsoLoginFailuresTotal'> | undefined,
  providerType: SSOProviderType | string,
  reason: SSOLoginFailureReason,
  logger?: Logger,
): void {
  try {
    metricsService?.authSsoLoginFailuresTotal.inc({
      provider_type: providerTypeLabel(providerType),
      reason,
    });
  } catch (error) {
    logger?.warn(`Failed to record SSO login failure metric: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isAccountLinkingFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'email' in error &&
    'externalId' in error &&
    'providerId' in error &&
    'providerType' in error
  );
}

export function classifySsoFailureReason(error: unknown): SSOLoginFailureReason {
  if (isAccountLinkingFailure(error)) {
    return 'linking_failed';
  }

  const status = typeof error === 'object' && error !== null && 'getStatus' in error
    ? (error as { getStatus?: () => number }).getStatus?.()
    : undefined;
  if (status === 400 || status === 401) {
    return 'invalid_assertion';
  }

  return 'provider_error';
}
