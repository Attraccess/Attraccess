import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VersionInfoDto {
  @ApiProperty({
    description: 'The currently running Attraccess version (semver, without a leading "v")',
    example: '0.0.16',
  })
  version!: string;

  @ApiPropertyOptional({
    description: 'The git commit SHA the running build was produced from, or null when not set',
    example: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    nullable: true,
  })
  commitHash!: string | null;
}
