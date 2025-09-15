import { Column, CreateDateColumn, Entity, Unique, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
@Unique('settings_identifier', ['parent', 'key'])
export class Setting {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the setting',
    example: 1,
  })
  id!: number;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The parent "object" this settings key belongs to' })
  parent!: string | null;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The key of the setting' })
  key!: string;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The value of the setting' })
  value!: string;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the setting was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the setting was last updated' })
  updatedAt!: Date;
}
