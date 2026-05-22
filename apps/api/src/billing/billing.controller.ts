import {
  Auth,
  AuthenticatedRequest,
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceFlowNodeType,
} from '@attraccess/plugins-backend-sdk';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Request,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { PaginationOptionsDto } from '../types/request';
import { ModifyBalanceDto } from './dto/modify-balance.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { BalanceDto } from './dto/balance.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { SumUpService } from './sumup.service';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { PairSumUpReaderDto } from './dto/sumup/pair-sumup-reader.dto';
import { SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { SumupTopUpDto } from './dto/sumup/top-up.dto';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';
import { Observable } from 'rxjs';
import { LiveNotificationsService } from './liveNotificationsService';
import { SumUpConfigurationDto } from './dto/sumup/sumup-configuration.dto';
import { ResourceBillingConfigurationDto } from './dto/resource-billing-configuration.dto';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';

@ApiTags('Billing')
@Controller()
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly sumUpService: SumUpService,
    private readonly liveNotificationsService: LiveNotificationsService,
    private readonly flowsService: ResourceFlowsService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Get('/users/:userId/billing/balance')
  @Auth()
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
    if (userId !== request.user.id && !request.user.systemPermissions.canManageBilling) {
      throw new ForbiddenException('You are not allowed to get the billing transactions for this user.');
    }

    return await this.billingService.getHistory(userId, query);
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
  @Auth('canManageBilling')
  async createManualTransaction(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() request: AuthenticatedRequest,
    @Body() body: ModifyBalanceDto,
  ): Promise<BillingTransaction> {
    return await this.billingService.createManualTransaction(userId, request.user.id, body.amount);
  }

  @Get('/resources/:resourceId/billing/configuration')
  @Auth()
  @ApiOperation({
    summary: 'Get the billing configuration for a resource',
    operationId: 'getResourceBillingConfiguration',
  })
  @ApiResponse({
    status: 200,
    description: 'The billing configuration for the resource.',
    type: ResourceBillingConfigurationDto,
  })
  async getResourceBillingConfiguration(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceBillingConfigurationDto> {
    const config = await this.billingService.getResourceBillingConfiguration(resourceId);

    const additionalItemsFlowNodes = await this.flowsService.getNodes(
      resourceId,
      ResourceFlowNodeType.RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
    );

    return {
      configuration: config,
      additionalItems: additionalItemsFlowNodes.map((node) => ({
        name: (node.data.name ?? '') as string,
        unitPrice: (node.data.unitPrice ?? 0) as number,
        quantity: (node.data.quantity ?? 0) as number,
      })),
      isBillingEnabled: await this.billingService.isBillingEnabled(resourceId),
    };
  }

  @Post('/resources/:resourceId/billing/configuration')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Update the billing configuration for a resource',
    operationId: 'updateResourceBillingConfiguration',
  })
  @ApiResponse({
    status: 200,
    description: 'The billing configuration for the resource has been updated.',
    type: ResourceBillingConfiguration,
  })
  async updateResourceBillingConfiguration(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() body: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfiguration> {
    return await this.billingService.updateResourceBillingConfiguration(resourceId, body);
  }

  @Post('/billing/sumup/configuration/api-key')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Set the SumUp configuration',
    operationId: 'setSumUpApiKey',
  })
  @ApiResponse({ status: 200, description: 'The SumUp apiKey has been set.', type: String, example: 'OK' })
  async setSumUpApiKey(@Body() body: SetSumUpApiKeyDto): Promise<string> {
    await this.sumUpService.setApiKey(body.apiKey);
    return 'OK';
  }

  @Post('/billing/configuration')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Set the billing configuration',
    operationId: 'setBillingConfiguration',
  })
  @ApiResponse({ status: 200, description: 'The billing configuration has been set.', type: BillingConfigurationDto })
  async setBillingConfiguration(@Body() body: SetBillingConfigurationDto): Promise<BillingConfigurationDto> {
    return await this.billingService.setConfiguration(body);
  }

  @Get('/billing/configuration')
  @Auth()
  @ApiOperation({
    summary: 'Get the billing configuration',
    operationId: 'getBillingConfiguration',
  })
  @ApiResponse({ status: 200, description: 'The current billing configuration.', type: BillingConfigurationDto })
  async getBillingConfiguration(): Promise<BillingConfigurationDto> {
    return await this.billingService.getConfiguration();
  }

  @Get('/billing/sumup/configuration')
  @Auth()
  @ApiOperation({
    summary: 'Get the SumUp configuration',
    operationId: 'getSumUpConfiguration',
  })
  @ApiResponse({ status: 200, description: 'The current SumUp configuration.', type: SumUpConfigurationDto })
  async getSumUpConfiguration(): Promise<SumUpConfigurationDto> {
    return { enabled: await this.sumUpService.getIsEnabled() };
  }

  @Get('/billing/sumup/readers')
  @Auth()
  @ApiOperation({
    summary: 'Get the linked SumUp readers',
    operationId: 'getSumUpReaders',
  })
  @ApiResponse({ status: 200, description: 'The linked SumUp readers.', type: SumUpReaderDto, isArray: true })
  async getSumUpReaders(): Promise<SumUpReaderDto[]> {
    return await this.sumUpService.getReaders();
  }

  @Post('/billing/sumup/readers/pair')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Pair a SumUp reader',
    operationId: 'pairSumUpReader',
  })
  @ApiResponse({ status: 200, description: 'The created SumUp reader.', type: SumUpReaderDto })
  async pairSumUpReader(@Body() body: PairSumUpReaderDto): Promise<SumUpReaderDto> {
    return await this.sumUpService.pairReader(body.pairingCode, body.name);
  }

  @Delete('/billing/sumup/readers/:readerId')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Remove a SumUp reader',
    operationId: 'removeSumUpReader',
  })
  async removeSumUpReader(@Param('readerId') readerId: string): Promise<void> {
    return await this.sumUpService.removeReader(readerId);
  }

  @Post('/billing/top-up/sumup')
  @Auth()
  @ApiOperation({
    summary: 'Top up using a SumUp reader',
    operationId: 'topUpWithSumUpReader',
  })
  @ApiResponse({
    status: 200,
    description: 'The billing transaction for the user has been topped up.',
    type: BillingTransaction,
  })
  async topUpWithSumUpReader(
    @Body() body: SumupTopUpDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BillingTransaction> {
    return await this.sumUpService.topUpWithReader(request.user.id, body.readerId, body.amount);
  }

  @Post('/billing/top-up/sumup/callback')
  @ApiOperation({
    summary: 'Callback from SumUp',
    operationId: 'sumUpTopUpCallback',
  })
  async sumUpTopUpCallback(@Body() data: SumupTransactionCallbackDto): Promise<{ message: string }> {
    this.logger.debug('Received SumUp callback', { data });
    await this.sumUpService.handleTransactionCallback(data);

    return { message: 'OK' };
  }

  @Sse('/billing/transactions/live')
  @Auth()
  async streamEvents(@Request() request: AuthenticatedRequest): Promise<Observable<{ data: BillingTransaction }>> {
    this.logger.log(`Client connected to SSE for user ${request.user.id}`);

    // Get the subject for this resource
    const subject = this.liveNotificationsService.getTransactionSubject(request.user.id);

    // Create an observable from the subject
    return this.sse.wrap('billing', subject.asObservable());
  }

  @Post('/billing/transactions/:transactionId/refund')
  @Auth('canManageBilling')
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
