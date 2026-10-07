import { Auth, AuthenticatedRequest, BillingTransaction } from '@attraccess/plugins-backend-sdk';
import { Body, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Req, Request } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaginationOptionsDto } from '../types/request';
import { BillingSumupRoutes } from './billing-sumup.routes';
import { ModifyBalanceDto } from './dto/modify-balance.dto';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { UsageTransactionDto } from './dto/usage-transaction.dto';
export abstract class BillingTransactionRoutes extends BillingSumupRoutes {
  @Get('/users/:userId/billing/transactions')
  @Auth()
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
    if (userId !== request.user.id && !request.user.effectivePermissions?.has('billing.manage')) {
      throw new ForbiddenException('You are not allowed to get the billing transactions for this user.');
    }

    return await this.billingService.getHistory(userId, query);
  }

  @Get('/billing/transactions/for-usage/:usageId')
  @Auth()
  @ApiOperation({
    summary: 'Find the current user’s billing transaction for a usage session',
    operationId: 'getUsageBillingTransaction',
  })
  @ApiResponse({
    status: 200,
    description: 'The related transaction ID, or null when no owned transaction exists.',
    type: UsageTransactionDto,
  })
  async getUsageBillingTransaction(
    @Param('usageId', ParseIntPipe) usageId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<UsageTransactionDto> {
    return { transactionId: await this.billingService.getTransactionIdForUsage(usageId, request.user.id) };
  }

  @Get('/users/:userId/billing/transactions/:transactionId')
  @Auth()
  @ApiOperation({ summary: 'Get a billing transaction for a user', operationId: 'getBillingTransaction' })
  @ApiResponse({ status: 200, description: 'The billing transaction for the user.', type: BillingTransaction })
  async getBillingTransaction(
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<BillingTransaction> {
    return await this.billingService.getTransaction(transactionId, request.user.id);
  }

  @Post('/users/:userId/billing/transactions')
  @ApiOperation({ summary: 'Top up or charge the billing balance for a user', operationId: 'createManualTransaction' })
  @ApiResponse({ status: 200, description: 'The billing balance for the user has been topped up.', type: Number })
  @Auth('billing.manage')
  async createManualTransaction(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() request: AuthenticatedRequest,
    @Body() body: ModifyBalanceDto,
  ): Promise<BillingTransaction> {
    return await this.billingService.createManualTransaction(userId, request.user.id, body.amount);
  }

  @Post('/billing/transactions/:transactionId/refund')
  @Auth('billing.manage')
  @ApiOperation({
    summary: 'Refund a billing transaction',
    operationId: 'refundTransaction',
  })
  @ApiResponse({ status: 200, description: 'The billing transaction has been refunded.', type: BillingTransaction })
  async refundTransaction(
    @Request() request: AuthenticatedRequest,
    @Param('transactionId', ParseIntPipe) transactionId: number,
    @Body() data: RefundTransactionDto,
  ) {
    return await this.billingService.refundTransaction(request.user.id, transactionId, data);
  }
}
