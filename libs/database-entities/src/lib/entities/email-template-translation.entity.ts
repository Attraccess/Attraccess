import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { EmailTemplateType } from './email-template.entity';

@Entity('email_template_translations')
export class EmailTemplateTranslation {
  @ApiProperty({ enum: EmailTemplateType, enumName: 'EmailTemplateType' })
  @PrimaryColumn({ type: 'varchar', length: 255 })
  templateType!: EmailTemplateType;

  @ApiProperty({ description: 'Translation key as used in {{t "key" "default"}} helper', example: 'greeting' })
  @PrimaryColumn({ type: 'varchar', length: 500 })
  key!: string;

  @ApiProperty({ description: 'BCP 47 locale tag', example: 'de' })
  @PrimaryColumn({ type: 'varchar', length: 10 })
  locale!: string;

  @ApiProperty({ description: 'Translated value', example: 'Hallo {name},' })
  @Column({ type: 'text' })
  value!: string;
}
