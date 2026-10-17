import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class PasswordHistory {
  @ApiProperty({ description: 'Primary identifier', example: 1 })
  id!: number;

  @ApiProperty({ description: 'Owning user id', example: 1 })
  userId!: number;

  @Exclude()
  @ApiProperty({ description: 'Bcrypt hash of a previously used password', required: false })
  passwordHash!: string;

  @ApiProperty({ description: 'When this entry was recorded' })
  createdAt!: Date;

  user!: User;
  static readonly responseFields: ResponseFields = { id: null, userId: null, createdAt: null, user: () => User };
}
