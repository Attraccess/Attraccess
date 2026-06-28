import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsQueryDto } from './dtos/analyticsQuery.dto';
import { PaginatedResourceUsageResponseDto } from './dtos/paginatedResourceUsageResponse.dto';
import { PaginatedBillingTransactionsResponseDto } from './dtos/paginatedBillingTransactionsResponse.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  public constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('resource-usage-hours')
  @Auth('canManageResources')
  @ApiResponse({
    status: 200,
    description: 'The resource usage hours in the date range',
    type: PaginatedResourceUsageResponseDto,
  })
  @ApiOperation({
    summary: 'Get the resource usage hours in the date range',
    operationId: 'getResourceUsageHoursInDateRange',
  })
  public async getResourceUsageHoursInDateRange(
    @Query() query: AnalyticsQueryDto,
  ): Promise<PaginatedResourceUsageResponseDto> {
    const { start, end, page, limit } = query;
    const [data, total] = await this.analyticsService.getResourceUsageHoursInDateRange({ start, end }, page, limit);
    return { data, total, page, limit, nextPage: page * limit < total ? page + 1 : undefined };
  }

  @Get('billing-transactions')
  @Auth('canManageResources')
  @ApiResponse({
    status: 200,
    description: 'The billing transactions in the date range',
    type: PaginatedBillingTransactionsResponseDto,
  })
  @ApiOperation({
    summary: 'Get the billing transactions in the date range',
    operationId: 'getBillingTransactionsInDateRange',
  })
  public async getBillingTransactionsInDateRange(
    @Query() query: AnalyticsQueryDto,
  ): Promise<PaginatedBillingTransactionsResponseDto> {
    const { start, end, page, limit } = query;
    const [data, total] = await this.analyticsService.getBillingTransactionsInDateRange({ start, end }, page, limit);
    return { data, total, page, limit, nextPage: page * limit < total ? page + 1 : undefined };
  }
}
