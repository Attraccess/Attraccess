import {
  Auth,
  AuthenticatedRequest,
  BillingTransaction,
  ResourceBillingConfiguration,
} from '@attraccess/plugins-backend-sdk';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { PaginationOptionsDto } from '../types/request';
import { ModifyBalanceDto } from './dto/modify-balance.dto';
import { TransactionsDto } from './dto/transactions.dto';
import { BalanceDto } from './dto/balance.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { SumUpConfigurationDto } from './dto/sumup/sumup-configuration.dto';
import { SumUpService } from './sumup.service';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { PairSumUpReaderDto } from './dto/sumup/pair-sumup-reader.dto';
import { SetSumUpConfigurationDto } from './dto/sumup/set-sumup-configuration.dto';
import { SumupTopUpDto } from './dto/sumup/top-up.dto';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';

@ApiTags('Billing')
@Controller()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly sumUpService: SumUpService,
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
  @ApiOperation({ summary: 'Get the billing configuration for a resource', operationId: 'getBillingConfiguration' })
  @ApiResponse({
    status: 200,
    description: 'The billing configuration for the resource.',
    type: ResourceBillingConfiguration,
  })
  async getBillingConfiguration(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceBillingConfiguration> {
    return await this.billingService.getResourceBillingConfiguration(resourceId);
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

  @Post('/billing/sumup/configuration')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Set the SumUp configuration',
    operationId: 'setSumUpConfiguration',
  })
  @ApiResponse({ status: 200, description: 'The SumUp configuration has been set.', type: SumUpConfigurationDto })
  async setSumUpConfiguration(@Body() body: SetSumUpConfigurationDto): Promise<SumUpConfigurationDto> {
    return await this.sumUpService.setConfiguration(body);
  }

  @Get('/billing/sumup/configuration')
  @Auth('canManageBilling')
  @ApiOperation({
    summary: 'Get the SumUp configuration',
    operationId: 'getSumUpConfiguration',
  })
  @ApiResponse({ status: 200, description: 'The current SumUp configuration.', type: SumUpConfigurationDto })
  async getSumUpConfiguration(): Promise<SumUpConfigurationDto> {
    return await this.sumUpService.getConfiguration();
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

  @Post('/billing/sumup/top-up')
  @Auth()
  @ApiOperation({
    summary: 'Top up using a SumUp reader',
    operationId: 'topUpWithSumUpReader',
  })
  async topUpWithSumUpReader(
    @Body() body: SumupTopUpDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<BillingTransaction> {
    return await this.sumUpService.topUpWithReader(request.user.id, body.readerId, body.tokenCount);
  }

  @Post('/billing/sumup/top-up/callback')
  @ApiOperation({
    summary: 'Callback from SumUp',
    operationId: 'sumUpTopUpCallback',
  })
  async sumUpTopUpCallback(@Body() data: SumupTransactionCallbackDto): Promise<{ message: string }> {
    await this.sumUpService.handleTransactionCallback(data);

    return { message: 'OK' };
  }
}
