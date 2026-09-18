import { ApiProperty } from '@nestjs/swagger';

export class RetryPluginResponseDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
