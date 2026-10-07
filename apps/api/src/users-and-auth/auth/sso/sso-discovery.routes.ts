import { AuthenticationType } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { BadRequestException, Body, Get, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SkipLicenseCheck } from '../../../license/require-license.decorator';
import { LinkUserToExternalAccountRequestDto } from './dto/link-user-to-external-account-request.dto';
import { SsoProviderRoutesImplementation } from './sso-provider.routes';
import { discoveryUrl, requestDiscoveryJson } from './sso-discovery-request';
export abstract class SsoDiscoveryRoutesImplementation extends SsoProviderRoutesImplementation {
  @Post('/link-account')
  @SkipLicenseCheck()
  @ApiOperation({
    summary: 'Link an account to an SSO identity via a signed token',
    operationId: 'linkUserToExternalAccount',
  })
  @ApiResponse({
    status: 200,
    description: 'The account has been linked to the SSO identity',
    schema: {
      type: 'object',
      properties: {
        OK: {
          type: 'boolean',
          description: 'Whether the account has been linked to the SSO identity',
        },
      },
    },
  })
  public async linkUserToExternalAccount(@Body() body: LinkUserToExternalAccountRequestDto): Promise<{ OK: boolean }> {
    const linkPayload = await this.linkTokenService.verify(body.linkToken);
    const user = await this.usersService.findOne({ email: linkPayload.email }, ['authenticationDetails']);
    if (!user) {
      throw new UnauthorizedException();
    }

    const existingSSODetail = await this.authService.findSSOAuthenticationDetail(user.id);
    if (existingSSODetail && existingSSODetail.providerId !== linkPayload.providerId) {
      throw new BadRequestException('SSO_ALREADY_LINKED');
    }

    const localAuth = user.authenticationDetails?.find((detail) => detail.type === AuthenticationType.LOCAL_PASSWORD);
    if (!localAuth) {
      throw new BadRequestException('PASSWORD_REQUIRED');
    }

    const isAuthenticated = await this.authService.validateAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password: body.password,
      },
    });

    if (!isAuthenticated) {
      throw new UnauthorizedException();
    }

    const existingSSOUserId = await this.authService.findUserIdBySSO(
      linkPayload.providerType,
      linkPayload.providerId,
      linkPayload.ssoSubject,
    );
    if (existingSSOUserId && existingSSOUserId !== user.id) {
      throw new BadRequestException('SSO_SUBJECT_ALREADY_LINKED');
    }

    if (existingSSODetail) {
      await this.authService.updateSSOSubject(existingSSODetail.id, linkPayload.ssoSubject);
    } else {
      await this.authService.addAuthenticationDetails(user.id, {
        type: AuthenticationType.SSO,
        details: {
          providerType: linkPayload.providerType,
          providerId: linkPayload.providerId,
          subject: linkPayload.ssoSubject,
        },
      });
    }

    // Remove local password to enforce SSO-only after linking
    if (localAuth) {
      await this.authService.removeAuthenticationDetails(localAuth.id);
    }
    await this.usersService.updateOne(user.id, { externalIdentifier: null });

    return { OK: true };
  }

  @Get('discovery/authentik')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Proxy Authentik OIDC well-known discovery', operationId: 'discoverAuthentikOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Authentik host, e.g. http://localhost:9000' })
  @ApiQuery({ name: 'applicationName', required: true, description: 'Authentik application slug' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or applicationName' })
  async discoverAuthentik(@Query('host') host: string, @Query('applicationName') applicationName: string) {
    if (typeof host !== 'string' || typeof applicationName !== 'string' || !host || !applicationName) {
      throw new BadRequestException('Missing required parameters');
    }

    if (['.', '..'].includes(applicationName)) throw new BadRequestException('Invalid discovery path');
    const target = discoveryUrl(
      host,
      `/application/o/${encodeURIComponent(applicationName)}/.well-known/openid-configuration`,
    );
    return requestDiscoveryJson(target);
  }

  @Get('discovery/keycloak')
  @Auth('system.sso.manage')
  @ApiOperation({ summary: 'Proxy Keycloak OIDC well-known discovery', operationId: 'discoverKeycloakOidc' })
  @ApiQuery({ name: 'host', required: true, description: 'Keycloak host, e.g. http://localhost:8080' })
  @ApiQuery({ name: 'realm', required: true, description: 'Keycloak realm name' })
  @ApiResponse({ status: 200, description: 'OIDC configuration JSON' })
  @ApiBadRequestResponse({ description: 'Invalid host or realm' })
  async discoverKeycloak(@Query('host') host: string, @Query('realm') realm: string) {
    if (typeof host !== 'string' || typeof realm !== 'string' || !host || !realm) {
      throw new BadRequestException('Missing required parameters');
    }

    if (['.', '..'].includes(realm)) throw new BadRequestException('Invalid discovery path');
    const target = discoveryUrl(host, `/realms/${encodeURIComponent(realm)}/.well-known/openid-configuration`);
    return requestDiscoveryJson(target);
  }
}
