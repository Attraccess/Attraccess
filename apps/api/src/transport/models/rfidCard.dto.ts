import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.dto';
import type { ResponseFields } from '../response-mapper';

export class NFCCard {
  @ApiProperty({ description: 'The ID of the NFC card' })
  id!: number;

  @ApiProperty({ description: 'The UID of the NFC card' })
  uid!: string;

  @ApiProperty({ description: 'The ID of the user that owns the NFC card', type: () => User })
  user!: User;

  @Exclude()
  keyNo!: number;

  @Exclude()
  key!: string;

  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @ApiProperty({ description: 'The date and time the NFC card was last seen', type: 'string', format: 'date-time' })
  lastSeen!: Date;

  @ApiProperty({ description: 'Whether the NFC card is active' })
  isActive!: boolean;
  static readonly responseFields: ResponseFields = {
    id: null,
    uid: null,
    user: () => User,
    createdAt: null,
    updatedAt: null,
    lastSeen: null,
    isActive: null,
  };
}
