import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailTemplate } from '@attraccess/database-entities';

export class LocalizedLabelDto {
  @ApiProperty({ example: 'Booking confirmed' })
  en: string;

  @ApiProperty({ example: 'Buchung bestätigt' })
  de: string;
}

export class EmailTemplatePluginDto {
  @ApiProperty({ description: 'Name of the plugin that declared the template', example: 'reservations' })
  name: string;

  @ApiProperty({ description: 'Name of the template in the list', type: LocalizedLabelDto })
  label: LocalizedLabelDto;
}

export class ListedEmailTemplateDto extends EmailTemplate {
  @ApiPropertyOptional({
    description: 'Set for templates a plugin declared; core templates have none',
    type: EmailTemplatePluginDto,
  })
  plugin?: EmailTemplatePluginDto;
}
