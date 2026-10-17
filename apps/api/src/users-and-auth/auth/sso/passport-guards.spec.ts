import { Test } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { MetricsService } from '../../../metrics/metrics.service';
import { SSOOIDCPassportGuard } from './oidc/oidc-passport.guard';
import { SSOSamlPassportGuard } from './saml/saml-passport.guard';
import { markSsoFailureMetricRecorded } from './sso-metrics';

describe.each([
  [SSOOIDCPassportGuard, 'oidc'],
  [SSOSamlPassportGuard, 'saml'],
] as const)('%s authentication metrics', (Guard, providerType) => {
  const inc = jest.fn();
  let guard: SSOOIDCPassportGuard | SSOSamlPassportGuard;
  const context = new ExecutionContextHost([{}, {}]);
  beforeEach(async () => {
    inc.mockClear();
    const module = await Test.createTestingModule({
      providers: [Guard, { provide: MetricsService, useValue: { authSsoLoginFailuresTotal: { inc } } }],
    }).compile();
    guard = module.get(Guard);
  });
  it('returns authenticated users without recording failure', () => {
    const user = { id: 5 };
    expect(guard.handleRequest(null, user, null, context)).toBe(user);
    expect(inc).not.toHaveBeenCalled();
  });
  it.each([
    [new UnauthorizedException(), 'invalid_assertion'],
    [new BadRequestException(), 'invalid_assertion'],
    [new Error('provider unavailable'), 'provider_error'],
  ])('preserves the original exception and records the failure class', (error, reason) => {
    expect(() => guard.handleRequest(error, null, null, context)).toThrow(error);
    expect(inc).toHaveBeenCalledWith({ provider_type: providerType, reason });
  });
  it('rejects a missing user and classifies passport info', () => {
    expect(() => guard.handleRequest(null, null, new UnauthorizedException(), context)).toThrow(UnauthorizedException);
    expect(inc).toHaveBeenCalledWith({ provider_type: providerType, reason: 'invalid_assertion' });
  });
  it('does not count failures already measured by the strategy', () => {
    const error = new UnauthorizedException();
    markSsoFailureMetricRecorded(error);
    expect(() => guard.handleRequest(error, null, null, context)).toThrow(error);
    expect(inc).not.toHaveBeenCalled();
  });
  it('does not double count account linking failures', () => {
    const error = Object.assign(new Error('linking required'), {
      email: 'a@example.test',
      externalId: 'external',
      providerId: 1,
      providerType,
    });
    expect(() => guard.handleRequest(error, null, null, context)).toThrow(error);
    expect(inc).not.toHaveBeenCalled();
  });
});
