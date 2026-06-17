import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateWebPresenceDto {
  @ApiProperty({ description: 'Whether the user is actively viewing the website' })
  @IsBoolean()
  present!: boolean;
}
