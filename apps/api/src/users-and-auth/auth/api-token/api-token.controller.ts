import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, SessionAuth } from '@attraccess/plugins-backend-sdk';
import { ApiTokenService } from './api-token.service';
import {
  ApiTokenMetadataDto,
  CreateApiTokenDto,
  CreateApiTokenResponseDto,
  ListApiTokensQueryDto,
  PaginatedApiTokensResponseDto,
  UpdateApiTokenDto,
} from './api-token.dto';
import { computeNextPage } from '../../../types/response';

@ApiTags('API tokens')
@Controller('users/me/api-tokens')
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @SessionAuth('users.api-tokens.manage')
  @Get()
  @ApiOperation({ summary: 'List the current user API tokens', operationId: 'listApiTokens' })
  @ApiOkResponse({ type: PaginatedApiTokensResponseDto })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListApiTokensQueryDto,
  ): Promise<PaginatedApiTokensResponseDto> {
    const result = await this.apiTokenService.list(request.user.id, query.page, query.limit);
    return {
      ...result,
      data: result.data.map(toMetadata),
      nextPage: computeNextPage(result.page, result.limit, result.total),
    };
  }

  @SessionAuth('users.api-tokens.manage')
  @Post()
  @ApiOperation({ summary: 'Create an API token', operationId: 'createApiToken' })
  @ApiOkResponse({ type: CreateApiTokenResponseDto })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateApiTokenDto,
  ): Promise<CreateApiTokenResponseDto> {
    const { apiToken, token } = await this.apiTokenService.create(request.user.id, body);
    return { ...toMetadata(apiToken), token };
  }

  @SessionAuth('users.api-tokens.manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Update an API token', operationId: 'updateApiToken' })
  @ApiOkResponse({ type: ApiTokenMetadataDto })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateApiTokenDto,
  ): Promise<ApiTokenMetadataDto> {
    return toMetadata(await this.apiTokenService.update(request.user.id, id, body));
  }

  @SessionAuth('users.api-tokens.manage')
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API token', operationId: 'revokeApiToken' })
  async revoke(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.apiTokenService.revoke(request.user.id, id);
  }
}

function toMetadata(apiToken: {
  id: number;
  name: string;
  permissionKeys: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}): ApiTokenMetadataDto {
  return {
    id: apiToken.id,
    name: apiToken.name,
    permissionKeys: apiToken.permissionKeys,
    createdAt: apiToken.createdAt,
    lastUsedAt: apiToken.lastUsedAt,
    expiresAt: apiToken.expiresAt,
  };
}
