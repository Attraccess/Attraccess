import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { FormTemplate } from './formTemplate.entity';

export enum FormFieldType {
  TEXT = 'text',
  TEXTAREA = 'textarea',
  BOOLEAN = 'boolean',
  SELECT = 'select',
  NUMBER = 'number',
}

export interface FormFieldOptions {
  selectOptions?: Array<{ value: string; label: string }>;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
  placeholder?: string;
  helpText?: string;
}

@Entity()
@Index(['templateId', 'sortOrder'])
@Index(['templateId', 'fieldKey'], { unique: true })
export class FormField {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the form field',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the form template this field belongs to',
    example: 1,
  })
  templateId!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The unique key for this field within the template',
    example: 'safety_equipment_checked',
  })
  fieldKey!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The display label for this field',
    example: 'Safety Equipment Checked',
  })
  label!: string;

  @Column({
    type: 'simple-enum',
    enum: FormFieldType,
  })
  @ApiProperty({
    description: 'The type of input field',
    enum: FormFieldType,
    example: FormFieldType.BOOLEAN,
  })
  fieldType!: FormFieldType;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({
    description: 'Additional options and configuration for the field',
    example: {
      validation: { required: true },
      helpText: 'Please confirm all safety equipment is in place',
    },
    required: false,
  })
  options!: FormFieldOptions | null;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether this field is required to be filled',
    example: true,
    default: false,
  })
  required!: boolean;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The sort order of this field within the form',
    example: 1,
  })
  sortOrder!: number;

  @ManyToOne(() => FormTemplate, (template) => template.fields, { 
    onDelete: 'CASCADE' 
  })
  @JoinColumn({ name: 'templateId' })
  @ApiProperty({
    description: 'The form template this field belongs to',
    type: () => FormTemplate,
  })
  template!: FormTemplate;
}