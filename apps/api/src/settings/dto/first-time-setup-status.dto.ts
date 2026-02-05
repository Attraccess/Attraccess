import { ApiProperty } from '@nestjs/swagger';

export class FirstTimeSetupStepsDto {
  @ApiProperty({
    description: 'Whether the app settings step (URLs and license) is completed.',
    example: true,
  })
  app!: boolean;

  @ApiProperty({
    description: 'Whether the SMTP settings step is completed.',
    example: false,
  })
  smtp!: boolean;

  @ApiProperty({
    description: 'Whether at least one admin user has been created.',
    example: false,
  })
  admin!: boolean;
}

export class FirstTimeSetupStatusDto {
  @ApiProperty({
    description: 'Whether first-time setup is still available (no users exist yet).',
    example: true,
  })
  available!: boolean;

  @ApiProperty({
    description: 'Which wizard steps are already completed. Used to open the first incomplete step.',
    type: FirstTimeSetupStepsDto,
  })
  stepsCompleted!: FirstTimeSetupStepsDto;
}
