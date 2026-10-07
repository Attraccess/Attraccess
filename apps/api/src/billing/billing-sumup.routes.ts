import { Auth, AuthenticatedRequest, BillingTransaction } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BillingControllerRouteContext } from './billing.controller.route-context';
import { PairSumUpReaderDto } from './dto/sumup/pair-sumup-reader.dto';
import { SetSumUpApiKeyDto } from './dto/sumup/set-sumup-apiKey.dto';
import { SumUpConfigurationDto } from './dto/sumup/sumup-configuration.dto';
import { SumUpReaderDto } from './dto/sumup/sumup-reader.dto';
import { SumupTransactionCallbackDto } from './dto/sumup/sumup-transaction-callback.dto';
import { SumupTopUpDto } from './dto/sumup/top-up.dto';
export abstract class BillingSumupRoutes extends BillingControllerRouteContext {
  @Post('/billing/sumup/configuration/api-key')
  @Auth('billing.manage')
  @ApiOperation({
    summary: 'Set the SumUp configuration',
    operationId: 'setSumUpApiKey',
  })
  @ApiResponse({ status: 200, description: 'The SumUp apiKey has been set.', type: String, example: 'OK' })
  async setSumUpApiKey(@Body() body: SetSumUpApiKeyDto): Promise<string> {
    await this.sumUpService.setApiKey(body.apiKey);
    return 'OK';
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
  @Auth('billing.manage')
  @ApiOperation({
    summary: 'Pair a SumUp reader',
    operationId: 'pairSumUpReader',
  })
  @ApiResponse({ status: 200, description: 'The created SumUp reader.', type: SumUpReaderDto })
  async pairSumUpReader(@Body() body: PairSumUpReaderDto): Promise<SumUpReaderDto> {
    return await this.sumUpService.pairReader(body.pairingCode, body.name);
  }

  @Delete('/billing/sumup/readers/:readerId')
  @Auth('billing.manage')
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
}
