import { ApiProperty } from '@nestjs/swagger';
import { User } from '@attraccess/database-entities';

export class CurrentUserDto extends User {
  @ApiProperty({ type: [String], description: 'Effective permission keys granted to this user via their assigned roles' })
  effectivePermissions!: string[];
}
