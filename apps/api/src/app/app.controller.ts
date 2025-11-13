import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/info')
  @ApiOperation({ summary: 'Return API information', operationId: 'info' })
  @ApiResponse({
    status: 200,
    description: 'API information',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Attraccess API' },
        status: { type: 'string', example: 'ok' },
      },
    },
  })
  getInfo() {
    return this.appService.getInfo();
  }

  @Post('/balena/device/reboot')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Reboot the host machine (only for balena devices)', operationId: 'rebootHost' })
  @ApiResponse({ status: 200, description: 'Host rebooted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have permission to reboot the host' })
  async rebootHost() {
    await this.appService.balenaRebootHost();
    return { message: 'Host rebooted successfully' };
  }

  @Post('/balena/device/shutdown')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Shutdown the host machine (only for balena devices)', operationId: 'shutdownHost' })
  @ApiResponse({ status: 200, description: 'Host shutdown successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have permission to shutdown the host' })
  async shutdownHost() {
    await this.appService.balenaShutdownHost();
    return { message: 'Host shutdown successfully' };
  }
}
