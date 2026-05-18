// Admin password policy endpoints: full read, partial update, per-role override CRUD with audit logs
// FEATURE: Password policy admin surface (admin-only, hot-reload, audit logged)

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseEnumPipe,
  Patch,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PasswordPolicyOverride, PasswordPolicyRole } from '@attraccess/database-entities';
import { PasswordPolicyConfig } from '@attraccess/shared';
import { PasswordPolicyService } from './password-policy.service';
import {
  PasswordPolicyDto,
  PasswordPolicyOverrideDto,
  UpdatePasswordPolicyDto,
  UpsertPasswordPolicyOverrideDto,
} from './admin-password-policy.dto';

@ApiTags('Password Policy Admin')
@Controller('admin/password-policy')
export class AdminPasswordPolicyController {
  private readonly logger = new Logger('PasswordPolicyAudit');

  constructor(private readonly service: PasswordPolicyService) {}

  @Get()
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Get the global password policy', operationId: 'getAdminPasswordPolicy' })
  @ApiResponse({ status: 200, description: 'The global password policy.', type: PasswordPolicyDto })
  async getPolicy(): Promise<PasswordPolicyDto> {
    return this.service.getPolicy();
  }

  @Patch()
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Update the global password policy', operationId: 'updateAdminPasswordPolicy' })
  @ApiResponse({ status: 200, description: 'Password policy updated.', type: PasswordPolicyDto })
  async updatePolicy(
    @Body() body: UpdatePasswordPolicyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PasswordPolicyDto> {
    const before = await this.service.getPolicy();
    this.assertRangeConsistency(body, before);
    const after = await this.service.updatePolicy(body);
    this.audit('global_policy_updated', request, {
      before,
      after,
      changed: Object.keys(body),
    });
    return after;
  }

  @Get('overrides')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'List all per-role password policy overrides', operationId: 'listPasswordPolicyOverrides' })
  @ApiResponse({ status: 200, description: 'All defined overrides.', type: [PasswordPolicyOverrideDto] })
  async listOverrides(): Promise<PasswordPolicyOverrideDto[]> {
    const rows = await this.service.listOverrides();
    return rows.map((row) => this.toOverrideDto(row));
  }

  @Get('overrides/:role')
  @Auth('canManageSystemConfiguration')
  @ApiParam({ name: 'role', enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  @ApiOperation({ summary: 'Get the per-role override for a single role', operationId: 'getPasswordPolicyOverride' })
  @ApiResponse({ status: 200, description: 'The override row, or null if unset.', type: PasswordPolicyOverrideDto, nullable: true })
  async getOverride(
    @Param('role', new ParseEnumPipe(PasswordPolicyRole)) role: PasswordPolicyRole,
  ): Promise<PasswordPolicyOverrideDto | null> {
    const row = await this.service.getOverride(role);
    return row ? this.toOverrideDto(row) : null;
  }

  @Put('overrides/:role')
  @Auth('canManageSystemConfiguration')
  @ApiParam({ name: 'role', enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  @ApiOperation({ summary: 'Upsert a per-role password policy override', operationId: 'upsertPasswordPolicyOverride' })
  @ApiResponse({ status: 200, description: 'The saved override row.', type: PasswordPolicyOverrideDto })
  async upsertOverride(
    @Param('role', new ParseEnumPipe(PasswordPolicyRole)) role: PasswordPolicyRole,
    @Body() body: UpsertPasswordPolicyOverrideDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PasswordPolicyOverrideDto> {
    const beforeRow = await this.service.getOverride(role);
    const before = beforeRow ? this.toOverrideDto(beforeRow) : null;
    const saved = await this.service.upsertOverride(role, body);
    const after = this.toOverrideDto(saved);
    this.audit('override_upserted', request, { role, before, after, changed: Object.keys(body) });
    return after;
  }

  @Delete('overrides/:role')
  @Auth('canManageSystemConfiguration')
  @ApiParam({ name: 'role', enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  @ApiOperation({ summary: 'Delete a per-role password policy override', operationId: 'deletePasswordPolicyOverride' })
  @ApiResponse({ status: 204, description: 'Override removed.' })
  async deleteOverride(
    @Param('role', new ParseEnumPipe(PasswordPolicyRole)) role: PasswordPolicyRole,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const beforeRow = await this.service.getOverride(role);
    const before = beforeRow ? this.toOverrideDto(beforeRow) : null;
    await this.service.deleteOverride(role);
    this.audit('override_deleted', request, { role, before });
  }

  private assertRangeConsistency(body: UpdatePasswordPolicyDto, current: PasswordPolicyConfig): void {
    const effectiveMin = body.minLength ?? current.minLength;
    const effectiveMax = body.maxLength ?? current.maxLength;
    if (effectiveMin > effectiveMax) {
      throw new BadRequestException(`minLength (${effectiveMin}) must be <= maxLength (${effectiveMax})`);
    }
  }

  private toOverrideDto(row: PasswordPolicyOverride): PasswordPolicyOverrideDto {
    return {
      role: row.role,
      minLength: row.minLength,
      maxLength: row.maxLength,
      allowAllUnicode: row.allowAllUnicode,
      requireUppercase: row.requireUppercase,
      requireLowercase: row.requireLowercase,
      requireDigit: row.requireDigit,
      requireSpecial: row.requireSpecial,
      checkHIBP: row.checkHIBP,
      checkCommonPasswords: row.checkCommonPasswords,
      minZxcvbnScore: row.minZxcvbnScore,
      historySize: row.historySize,
      rotationDays: row.rotationDays,
    };
  }

  private audit(event: string, request: AuthenticatedRequest, payload: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event,
        actorId: request.user?.id,
        actorUsername: request.user?.username,
        at: new Date().toISOString(),
        ...payload,
      }),
    );
  }
}
