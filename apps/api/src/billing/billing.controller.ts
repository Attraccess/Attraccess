import { Auth, AuthenticatedRequest, BillingTransaction } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { PaginationOptionsDto } from '../types/request';
import { ModifyBalanceDto } from './dto/modify-balance.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { BalanceDto } from './dto/balance.dto';

@ApiTags('Billing')
@Controller()
@Auth()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('/users/:userId/billing/balance')
  @ApiOperation({ summary: 'Get the billing balance for a user', operationId: 'getBillingBalance' })
  @ApiResponse({ status: 200, description: 'The billing balance for the user.', type: BalanceDto })
  async getBillingBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<BalanceDto> {
    if (request.user.id !== userId && !request.user.systemPermissions.canManageBilling) {
      throw new ForbiddenException('You are not allowed to get the billing balance for this user.');
    }

    const balance = await this.billingService.getBalance(userId);
    return { value: balance };
  }

  @Get('/users/:userId/billing/transactions')
  @ApiOperation({ summary: 'Get the billing transactions for a user', operationId: 'getBillingTransactions' })
  @ApiResponse({
    status: 200,
    description: 'The billing transactions for the user.',
    type: TransactionsDto,
  })
  async getBillingTransactions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() query: PaginationOptionsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TransactionsDto> {
    if (userId !== request.user.id && !request.user.systemPermissions.canManageBilling) {
      throw new ForbiddenException('You are not allowed to get the billing transactions for this user.');
    }

    return await this.billingService.getHistory(userId, query);
  }

  @Post('/users/:userId/billing/transactions')
  @ApiOperation({ summary: 'Top up or charge the billing balance for a user', operationId: 'createManualTransaction' })
  @ApiResponse({ status: 200, description: 'The billing balance for the user has been topped up.', type: Number })
  @Auth('canManageBilling')
  async createManualTransaction(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() request: AuthenticatedRequest,
    @Body() body: ModifyBalanceDto,
  ): Promise<BillingTransaction> {
    return await this.billingService.createManualTransaction(userId, request.user.id, body.amount);
  }
}
