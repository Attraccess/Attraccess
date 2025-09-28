import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InfoResponseDto } from './dto/info-response.dto';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/info')
  @ApiOperation({ summary: 'Return API information', operationId: 'getSystemInfo' })
  @ApiOkResponse({ description: 'API information', type: InfoResponseDto })
  getInfo(): InfoResponseDto {
    return this.appService.getInfo();
  }
}
