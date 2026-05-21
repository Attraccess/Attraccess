// Admin password policy endpoints: full read, partial update, per-role override CRUD with audit logs
// FEATURE: Password policy admin surface (admin-only, hot-reload, audit logged, server-side preview)

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PasswordPolicyOverride, PasswordPolicyRole } from '@attraccess/database-entities';
import { PasswordPolicyConfig } from '@attraccess/shared';
import { AuditContext, PasswordPolicyService, POLICY_FIELDS } from './password-policy.service';
import {
  PasswordPolicyDto,
  PasswordPolicyOverrideDto,
  PreviewPasswordDto,
  PreviewPasswordResultDto,
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
    const audit = this.buildAudit(request);
    const after = await this.service.updatePolicy(body, audit);
    this.mirrorAuditToLogger('global_policy_updated', audit, { changed: Object.keys(body) });
    return after;
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Auth('canManageSystemConfiguration')
  @ApiOperation({
    summary: 'Server-side preview: evaluate a candidate password against the current (or draft) policy',
    operationId: 'previewAdminPasswordPolicy',
  })
  @ApiResponse({ status: 200, description: 'Full preview result including zxcvbn + HIBP + history checks.', type: PreviewPasswordResultDto })
  async preview(@Body() body: PreviewPasswordDto): Promise<PreviewPasswordResultDto> {
    let policyOverride: PasswordPolicyConfig | undefined;
    if (body.draftPolicy) {
      const effective = await this.service.getEffectivePolicy(body.role);
      policyOverride = this.mergeDraft(effective, body.draftPolicy);
    }
    const result = await this.service.validate(body.password, {}, { role: body.role, policyOverride });
    return {
      ok: result.ok,
      errors: result.errors.map((e) => ({ code: e.code, params: e.params })),
      zxcvbn: result.zxcvbn,
    };
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
    const audit = this.buildAudit(request);
    const saved = await this.service.upsertOverride(role, body, audit);
    this.mirrorAuditToLogger('override_upserted', audit, { role, changed: Object.keys(body) });
    return this.toOverrideDto(saved);
  }

  @Delete('overrides/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth('canManageSystemConfiguration')
  @ApiParam({ name: 'role', enum: PasswordPolicyRole, enumName: 'PasswordPolicyRole' })
  @ApiOperation({ summary: 'Delete a per-role password policy override', operationId: 'deletePasswordPolicyOverride' })
  @ApiResponse({ status: 204, description: 'Override removed.' })
  async deleteOverride(
    @Param('role', new ParseEnumPipe(PasswordPolicyRole)) role: PasswordPolicyRole,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const audit = this.buildAudit(request);
    await this.service.deleteOverride(role, audit);
    this.mirrorAuditToLogger('override_deleted', audit, { role });
  }

  private mergeDraft(base: PasswordPolicyConfig, draft: UpdatePasswordPolicyDto): PasswordPolicyConfig {
    const merged: PasswordPolicyConfig = { ...base };
    for (const key of POLICY_FIELDS) {
      const value = (draft as unknown as Record<string, unknown>)[key];
      if (value !== undefined && value !== null) {
        (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
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

  private buildAudit(request: AuthenticatedRequest): AuditContext {
    const headers = (request.headers ?? {}) as Record<string, string | string[] | undefined>;
    const requestIdHeader = headers['x-request-id'];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    const userAgentHeader = headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
    return {
      actorId: request.user?.id ?? null,
      actorUsername: request.user?.username ?? null,
      ip: request.ip ?? null,
      userAgent: userAgent ?? null,
      requestId: requestId ?? null,
    };
  }

  private mirrorAuditToLogger(event: string, audit: AuditContext, extra: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        event,
        actorId: audit.actorId,
        actorUsername: audit.actorUsername,
        ip: audit.ip,
        requestId: audit.requestId,
        at: new Date().toISOString(),
        ...extra,
      }),
    );
  }
}
