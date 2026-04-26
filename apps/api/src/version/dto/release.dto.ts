import { ApiProperty } from '@nestjs/swagger';

export class ReleaseDto {
  @ApiProperty({ description: 'Release version (semver, without a leading "v")', example: '0.1.2' })
  version!: string;

  @ApiProperty({ description: 'Release tag name as published on GitHub', example: 'v0.1.2' })
  tagName!: string;

  @ApiProperty({ description: 'Human-readable release title', example: 'v0.1.2 – Bug fixes' })
  name!: string;

  @ApiProperty({ description: 'Release notes body as Markdown', example: '## Changes\n- Fixed X' })
  body!: string;

  @ApiProperty({ description: 'URL of the GitHub release page', example: 'https://github.com/Attraccess/Attraccess/releases/tag/v0.1.2' })
  htmlUrl!: string;

  @ApiProperty({ description: 'ISO-8601 timestamp when the release was published', example: '2026-04-20T12:34:56Z' })
  publishedAt!: string;
}
