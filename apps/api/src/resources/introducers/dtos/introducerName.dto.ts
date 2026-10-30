import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroducerType } from '@attraccess/database-entities';

/** Public-to-readers view of an introducer: who to ask for help, nothing else (no email). */
export class ResourceIntroducerNameDto {
  @ApiProperty({ description: 'ID of the user' })
  userId!: number;

  @ApiProperty({ description: 'Username of the user' })
  username!: string;

  @ApiProperty({
    description: 'Whether the user is an introducer or a maintainer. A user holding both is listed as introducer.',
    enum: ResourceIntroducerType,
    enumName: 'ResourceIntroducerType',
  })
  role!: ResourceIntroducerType;
}
