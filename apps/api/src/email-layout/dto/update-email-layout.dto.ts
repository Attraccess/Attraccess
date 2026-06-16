import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateEmailLayoutDto {
  @ApiProperty({
    description:
      'Full MJML document for the global email layout. Must contain {{{content}}} as a placeholder where individual template sections will be injected.',
  })
  @IsString()
  body!: string;
}
