import { ApiProperty } from '@nestjs/swagger';

export class InfoResponseDto {
  @ApiProperty({ example: 'Attraccess API' })
  name!: string;

  @ApiProperty({ example: 'ok' })
  status!: string;
}
