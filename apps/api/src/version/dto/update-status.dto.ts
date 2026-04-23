import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReleaseDto } from './release.dto';

export class UpdateStatusDto {
  @ApiProperty({ description: 'The currently running Attraccess version', example: '0.0.16' })
  currentVersion!: string;

  @ApiPropertyOptional({
    description: 'The highest version available on GitHub, or null when the check failed',
    example: '0.1.2',
    nullable: true,
  })
  latestVersion!: string | null;

  @ApiProperty({
    description: 'True when the latest release on GitHub is strictly newer than the running version',
    example: true,
  })
  isUpdateAvailable!: boolean;

  @ApiProperty({
    description:
      'True when the update check succeeded. False means the GitHub API call failed (network, rate limit, etc.)',
    example: true,
  })
  checkSucceeded!: boolean;

  @ApiPropertyOptional({
    description: 'The latest release details. Null when the check failed or no release exists.',
    type: ReleaseDto,
    nullable: true,
  })
  latestRelease!: ReleaseDto | null;
}
