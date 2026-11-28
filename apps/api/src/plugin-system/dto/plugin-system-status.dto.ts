import { ApiProperty } from '@nestjs/swagger';

export class PluginSystemStatusDto {
  @ApiProperty({ description: 'Whether plugins are globally disabled' })
  disabled!: boolean;

  @ApiProperty({ description: 'Identifier for the current API process' })
  instanceId!: string;

  @ApiProperty({
    description:
      'Whether plugin changes (install, update, upload, removal) wait for a restart of this API process to take effect',
  })
  restartRequired!: boolean;
}
