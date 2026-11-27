import { FORM_SCOPES, FormFieldType, ResourceFormAction, type FormScope } from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { User } from './user.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { ResourceGroup } from './resourceGroup.entity';

/**
 * Exactly the owner column the scope needs. A deleted group form may lose its group (the group was deleted), so its
 * groupId may be NULL.
 */
const FORM_SCOPE_CHECK =
  `("scope" = 'resource' AND "resourceId" IS NOT NULL AND "groupId" IS NULL) OR ` +
  `("scope" = 'group' AND "resourceId" IS NULL AND ("groupId" IS NOT NULL OR "deletedAt" IS NOT NULL)) OR ` +
  `("scope" = 'global' AND "resourceId" IS NULL AND "groupId" IS NULL)`;

@Entity()
@Check('CHK_form_scope', FORM_SCOPE_CHECK)
@Index('IDX_form_scope_group', ['scope', 'groupId'])
@Index('IDX_form_resource', ['resourceId'])
export class Form {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the form' })
  id!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the form was created' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
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

  @Column({ type: 'boolean', default: false })
  @ApiProperty({ description: 'Whether the form is required when a running session switches its project' })
  isRequiredOnResourceUsageProjectSwitch!: boolean;

  @OneToMany(() => FormField, (field) => field.form)
  @ApiProperty({ description: 'The fields of the form', type: () => FormField, isArray: true })
  fields!: FormField[];

  @OneToMany(() => FormSubmission, (submission) => submission.form)
  @ApiProperty({ description: 'The submissions of the form', type: () => FormSubmission, isArray: true })
  submissions!: FormSubmission[];

  @Column({ type: 'varchar', default: 'resource' })
  @ApiProperty({ description: 'Where the form applies', enum: [...FORM_SCOPES] })
  scope!: FormScope;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The resource of a resource form', nullable: true, type: Number })
  resourceId!: number | null;

  @ManyToOne(() => Resource, (resource) => resource.forms)
  @JoinColumn({ name: 'resourceId' })
  @ApiProperty({ description: 'The resource of a resource form', type: () => Resource })
  resource!: Resource | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The resource group of a group form', nullable: true, type: Number })
  groupId!: number | null;

  @ManyToOne(() => ResourceGroup, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'groupId' })
  group!: ResourceGroup | null;

  /** A plain column, not a TypeORM soft delete: submissions keep loading their deleted form for the history. */
  @Column({ type: 'timestamptz', nullable: true })
  @ApiProperty({ description: 'When the form was deleted', nullable: true, type: Date })
  deletedAt!: Date | null;

  @OneToMany(() => FormResourceOverride, (override) => override.form)
  overrides!: FormResourceOverride[];
}

/** How one resource deviates from a form that applies to it: switched off, or other required flags. */
@Entity()
@Index('IDX_form_resource_override_form_resource', ['formId', 'resourceId'], { unique: true })
@Index('IDX_form_resource_override_resource', ['resourceId'])
export class FormResourceOverride {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  formId!: number;

  @ManyToOne(() => Form, (form) => form.overrides, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formId' })
  form!: Form;

  @Column({ type: 'integer' })
  resourceId!: number;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceId' })
  resource!: Resource;

  @Column({ type: 'boolean', default: false })
  disabled!: boolean;

  @Column({ type: 'boolean', nullable: true })
  isRequiredOnResourceUsageStart!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  isRequiredOnResourceUsageTakeOver!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  isRequiredOnResourceUsageEnd!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  isRequiredOnResourceUsageProjectSwitch!: boolean | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}

@Entity()
@Index('IDX_form_field_form', ['formId'])
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

  @Column({ type: 'integer', default: 0 })
  @ApiProperty({ description: 'Position of the field within the form' })
  position!: number;

  @Column({ type: 'jsonb', nullable: true })
  @ApiProperty({ description: 'The options of the form field' })
  options!: Record<string, unknown> | string[] | null;
}

interface FormSubmissionFieldData {
  value: string;
  fieldDefinition: FormField;
}

type FormSubmissionData = Record<string, FormSubmissionFieldData>;

@Entity()
@Index('IDX_form_submission_form_created', ['formId', 'createdAt'])
@Index('IDX_form_submission_resource_usage', ['resourceUsageId'])
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

  @Column({ type: 'jsonb' })
  @ApiProperty({
    description: 'The data of the form submission',
  })
  data!: FormSubmissionData;

  @CreateDateColumn({ type: 'timestamptz' })
  @ApiProperty({ description: 'The date and time the submission was created' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
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
