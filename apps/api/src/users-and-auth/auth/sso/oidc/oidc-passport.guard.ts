import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SSOProviderType } from '@attraccess/database-entities';
import { MetricsService } from '../../../../metrics/metrics.service';
import { classifySsoFailureReason, isAccountLinkingFailure, isSsoFailureMetricRecorded, recordSsoLoginFailure } from '../sso-metrics';

@Injectable()
export class SSOOIDCPassportGuard extends AuthGuard('sso-oidc') {
  private readonly logger = new Logger(SSOOIDCPassportGuard.name);

  constructor(private readonly metricsService: MetricsService) {
    super();
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    if ((err || !user) && !isAccountLinkingFailure(err) && !isSsoFailureMetricRecorded(err)) {
      recordSsoLoginFailure(
        this.metricsService,
        SSOProviderType.OIDC,
        classifySsoFailureReason(err ?? info ?? status),
        this.logger,
      );
    }

    return super.handleRequest(err, user, info, context, status) as TUser;
  }
}
