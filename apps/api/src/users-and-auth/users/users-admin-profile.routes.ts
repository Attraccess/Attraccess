import { User } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { ChangeBillingFactorDto } from './dtos/changeBillingFactor.dto';
import { ChangeEmailDto } from './dtos/changeEmail.dto';
import { ChangeUsernameDto } from './dtos/changeUsername.dto';
import { SetUserPasswordDto } from './dtos/setUserPassword.dto';
import { mapEmailSendError } from './email-send-error.util';
import { UsersAdminControllerRouteContext } from './users-admin.controller.route-context';
export abstract class UsersAdminProfileRoutes extends UsersAdminControllerRouteContext {
  @Post(':id/password')
  @Auth()
  @ApiOperation({ summary: "Set a user's password directly", operationId: 'setUserPassword' })
  @ApiResponse({
    status: 200,
    description: 'The password has been successfully updated.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password updated successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async setUserPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetUserPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.passwordService.setUserPassword(id, body, request.user);
    await this.record('user_updated', id, request, 'password');
    return { message: 'Password updated successfully' };
  }

  @Patch(':id/username')
  @Auth('users.update')
  @ApiOperation({ summary: "Admin: Change a user's username (no limit)", operationId: 'changeUserUsername' })
  @ApiResponse({ status: 200, description: 'Username changed.', type: User })
  async changeUserUsername(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeUsernameDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    const user = await this.usersService.changeUsername(id, body.username, request.user);
    await this.record('user_updated', id, request, 'username');
    return user;
  }

  @Patch(':id/email')
  @Auth('users.update')
  @ApiOperation({ summary: "Admin: Change a user's email address", operationId: 'changeUserEmail' })
  @ApiResponse({ status: 200, description: 'Email changed.', type: User })
  async changeUserEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeEmailDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    try {
      const user = await this.usersService.changeEmail(id, body.email, request.user);
      await this.record('user_updated', id, request, 'email');
      return user;
    } catch (error) {
      throw mapEmailSendError(error);
    }
  }

  @Patch(':id/billing-factor')
  @Auth('billing.manage')
  @ApiOperation({ summary: "Change a user's billing factor", operationId: 'changeUserBillingFactor' })
  @ApiResponse({ status: 200, description: 'Billing factor changed.', type: User })
  async changeUserBillingFactor(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeBillingFactorDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<User> {
    const user = await this.usersService.changeBillingFactor(id, body.billingFactor);
    await this.record('user_updated', id, request, 'billingFactor');
    return user;
  }

  protected record(
    action: 'user_deleted' | 'user_updated',
    subjectId: number,
    request: AuthenticatedRequest,
    field?: 'username' | 'email' | 'password' | 'billingFactor',
  ): Promise<void> {
    return Promise.resolve(
      this.identityAudit?.record({
        action,
        operationId: randomUUID(),
        outcome: 'succeeded',
        actorId: request.user.id,
        authenticationMethod: request.user.authenticationMethod ?? 'session',
        apiTokenId: request.user.apiTokenId,
        subjectId,
        details: field ? { field } : {},
        request: { ipAddress: request.ip, userAgent: request.headers['user-agent'] },
      }),
    ).then(() => undefined);
  }
}
