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

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Name of the plugin that declared this permission; null for core permissions',
    example: 'matter',
    nullable: true,
    type: String,
  })
  pluginName!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'German label of a plugin permission; core permissions are translated by the frontend',
    nullable: true,
    type: String,
  })
  labelDe!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'German description of a plugin permission; core permissions are translated by the frontend',
    nullable: true,
    type: String,
  })
  descriptionDe!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'English label of the category group of a plugin permission',
    nullable: true,
    type: String,
  })
  categoryLabel!: string | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'German label of the category group of a plugin permission',
    nullable: true,
    type: String,
  })
  categoryLabelDe!: string | null;

  /**
   * False while the declaring plugin is not loaded (uninstalled, quarantined, failed, or a newer version dropped the
   * key). The row and its role and API-token grants stay, so they come back when the plugin loads again; until then
   * the key is hidden from the catalog and grants nothing. Core permissions are always available.
   */
  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description: 'Whether the permission currently grants anything; false while its plugin is not loaded',
    example: true,
  })
  available!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
