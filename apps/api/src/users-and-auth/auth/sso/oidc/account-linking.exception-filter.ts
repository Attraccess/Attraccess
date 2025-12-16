import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AccountLinkingRequiredException } from './exceptions/account-linking-required.exception';
import { SSOLinkTokenService } from '../link-token.service';

@Catch(AccountLinkingRequiredException)
export class AccountLinkingExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AccountLinkingExceptionFilter.name);

  constructor(private readonly linkTokenService: SSOLinkTokenService) {}

  catch(exception: AccountLinkingRequiredException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest() as Request;

    this.logger.log(`Account linking required for email: ${exception.email}`);

    // Get the original redirectTo from query params
    const redirectTo = request.query.redirectTo as string;
    this.logger.debug('Original query: ', request.query);

    if (redirectTo) {
      // Redirect to frontend with account linking data
      const frontendUrl = new URL(redirectTo);
      // Clear any existing parameters and set account linking parameters
      frontendUrl.search = '';
      const linkToken = this.linkTokenService.issue({
        email: exception.email,
        providerId: exception.providerId,
        providerType: exception.providerType,
        ssoSubject: exception.externalId,
      });
      frontendUrl.searchParams.set('accountLinking', 'required');
      frontendUrl.searchParams.set('ssoLinkToken', linkToken);
      // Email is provided only for UX display and must not be trusted by the client
      frontendUrl.searchParams.set('email', exception.email);

      this.logger.log(`Redirecting to frontend for account linking: ${frontendUrl.toString()}`);
      return response.redirect(frontendUrl.toString());
    }

    // Fallback: return JSON if no redirect URL
    const linkToken = this.linkTokenService.issue({
      email: exception.email,
      providerId: exception.providerId,
      providerType: exception.providerType,
      ssoSubject: exception.externalId,
    });
    response.status(400).json({
      error: 'AccountLinkingRequired',
      message: 'Account linking required',
      email: exception.email,
      linkToken,
    });
  }
}
