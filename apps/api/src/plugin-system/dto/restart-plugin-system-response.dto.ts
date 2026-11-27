import { ApiProperty } from '@nestjs/swagger';

export class RestartPluginSystemResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
