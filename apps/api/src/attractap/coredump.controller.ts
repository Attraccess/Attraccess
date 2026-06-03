import { Body, Controller, Logger, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { FileUpload } from '../common/types/file-upload.types';
import { AttractapCoredumpService } from './coredump.service';
import { CoredumpSymbolicationResultDto, SymbolicateCoredumpDto } from './dtos/coredump.dto';

@ApiTags('Attractap')
@Controller('attractap/coredumps')
export class AttractapCoredumpController {
  private readonly logger = new Logger(AttractapCoredumpController.name);

  public constructor(private readonly coredumpService: AttractapCoredumpService) {}

  @Post('symbolicate')
  @ApiOperation({ summary: 'Symbolicate an ESP32 coredump against its firmware ELF', operationId: 'symbolicateCoredump' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Coredump symbolicated successfully', type: CoredumpSymbolicationResultDto })
  @UseInterceptors(FileInterceptor('coredump'))
  @Auth('canManageSystemConfiguration')
  async symbolicateCoredump(
    @UploadedFile() coredump: FileUpload | undefined,
    @Body() body: SymbolicateCoredumpDto,
  ): Promise<CoredumpSymbolicationResultDto> {
    if (!coredump) {
      throw new BadRequestException('Missing coredump file');
    }

    this.logger.debug(`Symbolicating coredump ${coredump.originalname} (${coredump.size} bytes)`);

    return this.coredumpService.symbolicate(coredump.buffer, {
      firmwareName: body.firmwareName,
      variantName: body.variantName,
    });
  }
}
