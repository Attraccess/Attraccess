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
  ForbiddenException,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Request,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { BillingTransactionRoutes } from './billing-transaction.routes';
import { BillingService } from './billing.service';
import { BalanceDto } from './dto/balance.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { ResourceBillingConfigurationDto } from './dto/resource-billing-configuration.dto';
import { SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { LiveNotificationsService } from './liveNotificationsService';
import { SumUpService } from './sumup.service';
import { installInheritedMethods } from '../common/inherited-implementation';

@RequiresLicense(LicenseModuleType.BILLING)
@ApiTags('Billing')
@Controller()
export class BillingController extends BillingTransactionRoutes {
  protected readonly logger = new Logger(BillingController.name);

  constructor(
    protected readonly billingService: BillingService,
    protected readonly sumUpService: SumUpService,
    protected readonly liveNotificationsService: LiveNotificationsService,
    protected readonly flowsService: ResourceFlowsService,
    protected readonly sse: SseInstrumentation,
  ) {
    super();
  }

  @Get('/users/:userId/billing/balance')
  @Auth()
  @ApiOperation({ summary: 'Get the billing balance for a user', operationId: 'getBillingBalance' })
  @ApiResponse({ status: 200, description: 'The billing balance for the user.', type: BalanceDto })
  async getBillingBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<BalanceDto> {
    if (request.user.id !== userId && !request.user.effectivePermissions?.has('billing.manage')) {
      throw new ForbiddenException('You are not allowed to get the billing balance for this user.');
    }

    const balance = await this.billingService.getBalance(userId);
    return { value: balance };
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
      ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
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
  @Auth('billing.manage')
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

  @Post('/billing/configuration')
  @Auth('billing.manage')
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

  @Sse('/billing/transactions/live')
  @Auth()
  async streamEvents(@Request() request: AuthenticatedRequest): Promise<Observable<{ data: BillingTransaction }>> {
    this.logger.log(`Client connected to SSE for user ${request.user.id}`);

    const { id: userId } = request.user;
    const subject = this.liveNotificationsService.getTransactionSubject(userId);
    return this.sse.wrap(
      'billing',
      subject.asObservable().pipe(finalize(() => this.liveNotificationsService.deleteSubjectIfUnobserved(userId))),
    );
  }
}
installInheritedMethods(BillingController, [
  'getBillingBalance',
  'getBillingTransactions',
  'getUsageBillingTransaction',
  'getBillingTransaction',
  'createManualTransaction',
  'getResourceBillingConfiguration',
  'updateResourceBillingConfiguration',
  'setSumUpApiKey',
  'setBillingConfiguration',
  'getBillingConfiguration',
  'getSumUpConfiguration',
  'getSumUpReaders',
  'pairSumUpReader',
  'removeSumUpReader',
  'topUpWithSumUpReader',
  'sumUpTopUpCallback',
  'streamEvents',
  'refundTransaction',
]);
