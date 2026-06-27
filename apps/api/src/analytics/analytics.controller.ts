import { Controller, Get, Query } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { AnalyticsService } from './analytics.service';
import { Auth, BillingTransaction, ResourceUsage } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  public constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('resource-usage-hours')
  @Auth('resources.update')
  @ApiResponse({
    status: 200,
    description: 'The resource usage hours in the date range',
    type: [ResourceUsage],
  })
  @ApiOperation({
    summary: 'Get the resource usage hours in the date range',
    operationId: 'getResourceUsageHoursInDateRange',
  })
  public async getResourceUsageHoursInDateRange(@Query() dateRange: DateRangeValue) {
    return this.analyticsService.getResourceUsageHoursInDateRange(dateRange);
  }

  @Get('billing-transactions')
  @Auth('resources.update')
  @ApiResponse({
    status: 200,
    description: 'The billing transactions in the date range',
    type: [BillingTransaction],
  })
  @ApiOperation({
    summary: 'Get the billing transactions in the date range',
    operationId: 'getBillingTransactionsInDateRange',
  })
  public async getBillingTransactionsInDateRange(@Query() dateRange: DateRangeValue) {
    return this.analyticsService.getBillingTransactionsInDateRange(dateRange);
  }
}
