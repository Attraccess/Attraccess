import { ApiProperty } from '@nestjs/swagger';

export type LogoutUnavailableReason =
  'local_session' | 'provider_unavailable' | 'missing_correlation' | 'provider_failed';

export class LogoutCapability {
  @ApiProperty() available: boolean;
  @ApiProperty({
    required: false,
    enum: ['local_session', 'provider_unavailable', 'missing_correlation', 'provider_failed'],
  })
  reason?: LogoutUnavailableReason;
}

export class CentralLogoutResult {
  @ApiProperty({ enum: ['redirect', 'local_only'] }) kind: 'redirect' | 'local_only';
  @ApiProperty({ required: false }) redirectUrl?: string;
  @ApiProperty({
    required: false,
    enum: ['local_session', 'provider_unavailable', 'missing_correlation', 'provider_failed'],
  })
  reason?: LogoutUnavailableReason;
}

export class SsoLogoutSetupUrls {
  @ApiProperty() postLogoutUrl: string;
  @ApiProperty() backchannelLogoutUrl: string;
  @ApiProperty() frontchannelLogoutUrl: string;
  @ApiProperty() samlSloUrl: string;
}

export class LogoutReturnResult {
  @ApiProperty({ enum: ['failed', 'partial', 'returned'] }) result: 'failed' | 'partial' | 'returned';
}
