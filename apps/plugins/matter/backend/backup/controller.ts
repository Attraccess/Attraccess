import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
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
import { principalOf } from '../connection/controller';
import { parse } from '../fabric/controller';
import { confirmSchema, idParamSchema, validateSchema } from '../fabric/schemas';
import { MatterBackupService, type BackupView } from './backup.service';
import { MatterRestoreService, type RestoreResult, type RestoreValidation } from './restore.service';

/** Admin REST API for backups and restore. Never returns the recovery key or decrypted content. */
// TODO(ATT-1003): replace system.plugins.manage with a dedicated Matter permission
@Auth('system.plugins.manage')
@Controller('matter')
export class MatterBackupController {
  constructor(
    @Inject(MatterBackupService) private readonly backups: MatterBackupService,
    @Inject(MatterRestoreService) private readonly restore: MatterRestoreService,
  ) {}

  @Get('backups')
  list(): Promise<BackupView[]> {
    return this.backups.list();
  }

  /** Back up now. */
  @Post('backups')
  @HttpCode(200)
  create(@Req() request: AuthenticatedRequest): Promise<BackupView> {
    return this.backups.backup('manual', principalOf(request));
  }

  /** The encrypted file only: useless without the recovery key. */
  @Get('backups/:id/download')
  @Header('Content-Type', 'application/octet-stream')
  async download(@Param('id') id: string): Promise<StreamableFile> {
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) throw new BadRequestException(['id: must be a UUID']);
    const { filename, file } = await this.backups.download(parsedId.data);
    return new StreamableFile(file, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${filename}"`,
      length: file.length,
    });
  }

  @Post('restore/validate')
  @HttpCode(200)
  validate(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RestoreValidation> {
    const input = parse(validateSchema, body);
    return this.restore.validate(input.source, input.recoveryKey, principalOf(request));
  }

  @Post('restore/confirm')
  @HttpCode(200)
  confirm(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<RestoreResult> {
    const input = parse(confirmSchema, body);
    return this.restore.confirm(input.validationId, input.confirmFabricId, principalOf(request));
  }

  @Post('restore/:validationId/cancel')
  @HttpCode(204)
  async cancel(@Param('validationId') validationId: string, @Req() request: AuthenticatedRequest): Promise<void> {
    const parsedId = idParamSchema.safeParse(validationId);
    if (!parsedId.success) throw new BadRequestException(['validationId: must be a UUID']);
    await this.restore.cancel(parsedId.data, principalOf(request));
  }
}
