import { SSOProviderType } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';

export class AccountLinkingRequiredException extends BadRequestException {
  public readonly email: string;
  public readonly externalId: string;
  public readonly providerId: number;
  public readonly providerType: SSOProviderType;

  constructor(params: { email: string; externalId: string; providerId: number; providerType: SSOProviderType }) {
    super('AccountLinkingRequiredException');
    this.email = params.email;
    this.externalId = params.externalId;
    this.providerId = params.providerId;
    this.providerType = params.providerType;
  }
}
