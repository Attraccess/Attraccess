import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from './user.dto';
import { SsoSessionContext } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class Session {
  @ApiProperty({
    description: 'The unique identifier of the session',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The session token',
    example: 'abc123def456...',
    writeOnly: true,
  })
  @Exclude()
  token!: string;

  @ApiProperty({
    description: 'The ID of the user this session belongs to',
    example: 1,
  })
  userId!: number;

  @ApiProperty({
    description: 'The user agent string from the request that created this session',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    nullable: true,
  })
  userAgent!: string | null;

  @ApiProperty({
    description: 'The IP address from the request that created this session',
    example: '192.168.1.100',
    nullable: true,
  })
  ipAddress!: string | null;

  @Exclude()
  @ApiHideProperty()
  ssoProviderId?: number | null;

  @Exclude()
  @ApiHideProperty()
  ssoProtocol?: string | null;

  @Exclude()
  @ApiHideProperty()
  ssoSubject?: string | null;

  @Exclude()
  @ApiHideProperty()
  ssoSessionId?: string | null;

  @Exclude()
  @ApiHideProperty()
  ssoContext?: SsoSessionContext | null;

  @ApiProperty({
    description: 'When this session expires',
    example: '2025-01-19T12:00:00.000Z',
  })
  expiresAt!: Date;

  @ApiProperty({
    description: 'When this session was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When this session was last accessed',
    example: '2025-01-18T12:30:00.000Z',
  })
  lastAccessedAt!: Date;

  @ApiProperty({
    description: 'The user this session belongs to',
    type: () => User,
  })
  user!: User;
  static readonly responseFields: ResponseFields = {
    id: null,
    userId: null,
    userAgent: null,
    ipAddress: null,
    expiresAt: null,
    createdAt: null,
    lastAccessedAt: null,
    user: () => User,
  };
}
