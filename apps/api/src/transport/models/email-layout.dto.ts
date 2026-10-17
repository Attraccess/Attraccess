import { ApiProperty } from '@nestjs/swagger';
import type { ResponseFields } from '../response-mapper';

export class EmailLayout {
  @ApiProperty({ description: 'Layout identifier', example: 'global' })
  id!: string;

  @ApiProperty({
    description:
      'Full MJML document used as the global email layout. Use {{{content}}} as a placeholder where individual template sections will be injected.',
  })
  body!: string;

  @ApiProperty({ description: 'Timestamp of when the layout was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp of when the layout was last updated' })
  updatedAt!: Date;
  static readonly responseFields: ResponseFields = { id: null, body: null, createdAt: null, updatedAt: null };
}

export { EMAIL_LAYOUT_SINGLETON_ID } from '@attraccess/application-models';
