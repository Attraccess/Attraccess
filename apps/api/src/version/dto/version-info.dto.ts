import { ApiProperty } from '@nestjs/swagger';

export class VersionInfoDto {
  @ApiProperty({
    description: 'The currently running Attraccess version (semver, without a leading "v")',
    example: '0.0.16',
  })
  version!: string;
}
