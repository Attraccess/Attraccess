import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity('permission')
export class Permission {
  @PrimaryColumn({ type: 'text' })
  @ApiProperty({
    description: 'Stable string key identifying this permission',
    example: 'resources.read',
  })
  key!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Human-readable label for this permission',
    example: 'Read Resources',
  })
  label!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Description of what this permission grants',
    example: 'Allows reading resource information',
  })
  description!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Category grouping for this permission',
    example: 'resources',
  })
  category!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
