import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ApiTokenService } from './api-token.service';
import { ApiTokenMetadataDto, CreateApiTokenDto, CreateApiTokenResponseDto, UpdateApiTokenDto } from './api-token.dto';

@ApiTags('API tokens')
@Controller('users/me/api-tokens')
export class ApiTokenController {
  constructor(private readonly apiTokenService: ApiTokenService) {}

  @Auth()
  @Get()
  @ApiOperation({ summary: 'List the current user API tokens', operationId: 'listApiTokens' })
  @ApiOkResponse({ type: [ApiTokenMetadataDto] })
  async list(@Req() request: AuthenticatedRequest): Promise<ApiTokenMetadataDto[]> {
    return (await this.apiTokenService.list(request.user.id)).map(toMetadata);
  }

  @Auth()
  @Post()
  @ApiOperation({ summary: 'Create an API token', operationId: 'createApiToken' })
  @ApiOkResponse({ type: CreateApiTokenResponseDto })
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateApiTokenDto): Promise<CreateApiTokenResponseDto> {
    const { apiToken, token } = await this.apiTokenService.create(
      request.user.id,
      (request.user as AuthenticatedUser).effectivePermissions ?? new Set(),
      body,
    );
    return { ...toMetadata(apiToken), token };
  }

  @Auth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update an API token', operationId: 'updateApiToken' })
  @ApiOkResponse({ type: ApiTokenMetadataDto })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateApiTokenDto,
  ): Promise<ApiTokenMetadataDto> {
    return toMetadata(
      await this.apiTokenService.update(
        request.user.id,
        id,
        (request.user as AuthenticatedUser).effectivePermissions ?? new Set(),
        body,
      ),
    );
  }

  @Auth()
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
