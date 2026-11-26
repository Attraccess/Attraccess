import { Auth, type AuthenticatedRequest, NotAnMcpTool } from '@attraccess/plugins-backend-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { MATTER_OPERATIONS } from '../permissions';
import { principalOf } from '../connection/controller';
import { parse } from '../fabric/controller';
import { confirmSchema, idParamSchema, validateSchema } from '../fabric/schemas';
import { MatterBackupService, type BackupView } from './backup.service';
import { MatterRestoreService, type RestoreResult, type RestoreValidation } from './restore.service';

/** Admin REST API for backups and restore. Never returns the recovery key or decrypted content. */
@Controller('matter')
export class MatterBackupController {
  constructor(
    @Inject(MatterBackupService) private readonly backups: MatterBackupService,
    @Inject(MatterRestoreService) private readonly restore: MatterRestoreService,
  ) {}

  @Auth(...MATTER_OPERATIONS.backupList)
  @Get('backups')
  list(): Promise<BackupView[]> {
    return this.backups.list();
  }

  /** Back up now. */
  @Auth(...MATTER_OPERATIONS.backupCreate)
  @Post('backups')
  @HttpCode(200)
  create(@Req() request: AuthenticatedRequest): Promise<BackupView> {
    return this.backups.backup('manual', principalOf(request));
  }

  /** The encrypted file only: useless without the recovery key. */
  @Auth(...MATTER_OPERATIONS.backupDownload)
  @Get('backups/:id/download')
  @Header('Content-Type', 'application/octet-stream')
  @NotAnMcpTool('Secret material: serves a fabric backup')
  async download(@Param('id') id: string, @Req() request: AuthenticatedRequest): Promise<StreamableFile> {
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) throw new BadRequestException(['id: must be a UUID']);
    const { filename, file } = await this.backups.download(parsedId.data, principalOf(request));
    return new StreamableFile(file, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${filename}"`,
      length: file.length,
    });
  }

  @Auth(...MATTER_OPERATIONS.restoreValidate)
  @Post('restore/validate')
  @HttpCode(200)
  @NotAnMcpTool('Key material: restores a fabric from a backup')
  validate(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RestoreValidation> {
    const input = parse(validateSchema, body);
    return this.restore.validate(input.source, input.recoveryKey, principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.restoreConfirm)
  @Post('restore/confirm')
  @HttpCode(200)
  @NotAnMcpTool('Key material: restores a fabric from a backup')
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RestoreResult> {
    const input = parse(confirmSchema, body);
    return this.restore.confirm(input.validationId, input.confirmFabricId, principalOf(request));
  }

  @Auth(...MATTER_OPERATIONS.restoreCancel)
  @Post('restore/:validationId/cancel')
  @HttpCode(204)
  @NotAnMcpTool('Key material: restores a fabric from a backup')
  async cancel(@Param('validationId') validationId: string, @Req() request: AuthenticatedRequest): Promise<void> {
    const parsedId = idParamSchema.safeParse(validationId);
    if (!parsedId.success) throw new BadRequestException(['validationId: must be a UUID']);
    await this.restore.cancel(parsedId.data, principalOf(request));
  }
}
