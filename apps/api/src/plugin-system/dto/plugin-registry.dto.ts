import { ApiProperty } from '@nestjs/swagger';

export class PluginRegistryDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  url: string;
  @ApiProperty()
  tokenConfigured: boolean;
}

export class PluginRegistrySummaryDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  url: string;
}
