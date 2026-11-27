import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { UPDATE_STEPS } from '../npm/update-policy';

// The request body stays a plain object, so that the global pipe cannot coerce "false" into true before the policy
// validates it; these classes describe it (and the response) for the API documentation and the generated client.

export class PluginUpdateScheduleDto {
  @ApiProperty({ type: [Number], description: 'ISO weekdays a window starts on, 1 = Monday to 7 = Sunday' })
  weekdays: number[];

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 1439, description: 'Local start time, as a minute of the day' })
  startMinute: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1440 })
  durationMinutes: number;

  @ApiProperty({ type: String, nullable: true, description: 'IANA time zone; null (never chosen) means UTC' })
  timeZone: string | null;
}

/** The schedule fields to change; the host keeps the others. */
export class UpdatePluginUpdateScheduleDto {
  @ApiPropertyOptional({ type: [Number], description: 'ISO weekdays a window starts on, 1 = Monday to 7 = Sunday' })
  weekdays?: number[];

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 1439,
    description: 'Local start time, as a minute of the day',
  })
  startMinute?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 1440 })
  durationMinutes?: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'IANA time zone; null means UTC' })
  timeZone?: string | null;
}

export class PluginUpdatePolicyDto {
  @ApiProperty({ description: 'Whether the host looks for newer versions. Looking installs nothing.' })
  checksEnabled: boolean;

  @ApiProperty({ description: 'Whether the host installs updates and restarts on its own, inside the schedule' })
  automaticUpdates: boolean;

  @ApiProperty({ enum: UPDATE_STEPS })
  mode: (typeof UPDATE_STEPS)[number];

  @ApiProperty({ type: PluginUpdateScheduleDto })
  schedule: PluginUpdateScheduleDto;

  @ApiProperty()
  prerelease: boolean;
}

export class UpdatePluginUpdatePolicyDto {
  @ApiPropertyOptional()
  checksEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Switching this on needs at least one weekday' })
  automaticUpdates?: boolean;

  @ApiPropertyOptional({ enum: UPDATE_STEPS })
  mode?: (typeof UPDATE_STEPS)[number];

  @ApiPropertyOptional({ type: UpdatePluginUpdateScheduleDto })
  schedule?: UpdatePluginUpdateScheduleDto;

  @ApiPropertyOptional()
  prerelease?: boolean;
}
