import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export const EMAIL_LAYOUT_SINGLETON_ID = 'global';

@Entity('email_layout')
export class EmailLayout {
  @ApiProperty({ description: 'Layout identifier', example: 'global' })
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id!: string;

  @ApiProperty({
    description:
      'Full MJML document used as the global email layout. Use {{{content}}} as a placeholder where individual template sections will be injected.',
  })
  @Column({ type: 'text' })
  body!: string;

  @ApiProperty({ description: 'Timestamp of when the layout was created' })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({ description: 'Timestamp of when the layout was last updated' })
  @UpdateDateColumn()
  updatedAt!: Date;
}
