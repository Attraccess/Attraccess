import { ApiProperty } from '@nestjs/swagger';

export class CompanionPlatformEntry {
  @ApiProperty({ example: 'linux' })
  platform: string;

  @ApiProperty({ example: 'x64' })
  arch: string;

  @ApiProperty({ example: 'companion-linux-x64.AppImage' })
  filename: string;
}

export class CompanionManifestDto {
  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: 'abc123def456' })
  buildId: string;

  @ApiProperty({ type: [CompanionPlatformEntry] })
  platforms: CompanionPlatformEntry[];
}

export class CompanionVersionDto {
  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty({ example: 'abc123def456' })
  buildId: string;
}
