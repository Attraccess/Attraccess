import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceUsage } from './resourceUsage.entity';

export enum FormFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  DATETIME = 'datetime',
  BOOLEAN = 'boolean',
}

export enum ResourceFormAction {
  START = 'start',
  TAKEOVER = 'takeover',
  END = 'end',
}

@Entity()
export class Form {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the form' })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the form was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the form was last updated' })
  updatedAt!: Date;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The name of the form' })
  name!: string;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the form is required on resource usage start' })
  isRequiredOnResourceUsageStart!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the form is required on resource usage take over' })
  isRequiredOnResourceUsageTakeOver!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the form is required on resource usage end' })
  isRequiredOnResourceUsageEnd!: boolean;

  @OneToMany(() => FormField, (field) => field.form)
  @ApiProperty({ description: 'The fields of the form', type: () => FormField, isArray: true })
  fields!: FormField[];

  @OneToMany(() => FormSubmission, (submission) => submission.form)
  @ApiProperty({ description: 'The submissions of the form', type: () => FormSubmission, isArray: true })
  submissions!: FormSubmission[];

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the resource that the form belongs to' })
  resourceId!: number;

  @ManyToOne(() => Resource, (resource) => resource.forms)
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({ description: 'The resource that the form belongs to', type: () => Resource })
  resource!: Resource;
}

@Entity()
export class FormField {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the form field' })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the form that the field belongs to' })
  formId!: number;

  @ManyToOne(() => Form, (form) => form.fields)
  @JoinColumn({ name: 'formId' })
  @ApiProperty({ description: 'The form that the field belongs to', type: () => Form })
  form!: Form;

  @Column({ type: 'text' })
  @ApiProperty({ description: 'The name of the form field' })
  name!: string;

  @Column({ type: 'simple-enum', enum: FormFieldType })
  @ApiProperty({ description: 'The type of the form field', enum: FormFieldType, enumName: 'FormFieldType' })
  type!: FormFieldType;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the form field is required' })
  isRequired!: boolean;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({ description: 'The description of the form field' })
  description!: string | null;

  @Column({ type: 'json', nullable: true })
  @ApiProperty({ description: 'The options of the form field' })
  options!: Record<string, unknown> | null;
}

interface FormSubmissionFieldData {
  value: string;
  fieldDefinition: FormField;
}

type FormSubmissionData = Record<string, FormSubmissionFieldData>;

@Entity()
export class FormSubmission {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the form submission' })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the form that the submission belongs to' })
  formId!: number;

  @ManyToOne(() => Form, (form) => form.submissions)
  @JoinColumn({ name: 'formId' })
  @ApiProperty({ description: 'The form that the submission belongs to', type: () => Form })
  form!: Form;

  @Column({ type: 'json' })
  @ApiProperty({
    description: 'The data of the form submission',
  })
  data!: FormSubmissionData;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the submission was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the submission was last updated' })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the user that submitted the form' })
  userId!: number;

  @ManyToOne(() => User, (user) => user.formSubmissions)
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The user that submitted the form', type: () => User })
  user!: User;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The ID of the resource usage that the submission belongs to' })
  resourceUsageId!: number;

  @ManyToOne(() => ResourceUsage, (resourceUsage) => resourceUsage.formSubmissions)
  @JoinColumn({ name: 'resourceUsageId' })
  @ApiProperty({ description: 'The resource usage that the submission belongs to', type: () => ResourceUsage })
  resourceUsage!: ResourceUsage;

  @Column({ type: 'text', default: ResourceFormAction.START })
  @ApiProperty({ description: 'The action that triggered the submission', enum: ResourceFormAction })
  action!: ResourceFormAction;
}
