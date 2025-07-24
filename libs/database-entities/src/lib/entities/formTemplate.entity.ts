import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { FormField } from './formField.entity';
import { ResourceFormAssignment } from './resourceFormAssignment.entity';
import { FormSubmission } from './formSubmission.entity';

@Entity()
@Index(['name'])
@Index(['isActive'])
export class FormTemplate {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the form template',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The name of the form template',
    example: 'Equipment Safety Checklist',
  })
  name!: string;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'A detailed description of the form template',
    example: 'Safety checklist to be completed before using heavy machinery',
    required: false,
  })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  @ApiProperty({
    description: 'Whether this form template is active and can be used',
    example: true,
    default: true,
  })
  isActive!: boolean;

  @OneToMany(() => FormField, (field) => field.template, { 
    cascade: true,
    onDelete: 'CASCADE'
  })
  @ApiProperty({
    description: 'The fields that belong to this form template',
    type: () => FormField,
    isArray: true,
  })
  fields!: FormField[];

  @OneToMany(() => ResourceFormAssignment, (assignment) => assignment.template)
  @ApiProperty({
    description: 'The resource assignments for this form template',
    type: () => ResourceFormAssignment,
    isArray: true,
  })
  assignments!: ResourceFormAssignment[];

  @OneToMany(() => FormSubmission, (submission) => submission.template)
  @ApiProperty({
    description: 'The submissions made using this form template',
    type: () => FormSubmission,
    isArray: true,
  })
  submissions!: FormSubmission[];

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the form template was created',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When the form template was last updated',
  })
  updatedAt!: Date;
}