import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangeUsernameDto {
  @ApiProperty({ description: 'The new username', example: 'new_handle' })
  @IsString()
  username!: string;
}
