import type { ResourceFormAction } from '@attraccess/application-models';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';
import { Attractap } from './attractap.entity';
import { FormSubmission } from './form';

/**
 * A short-lived link that lets a phone add images to one field of a reader's open form (ATT-879). Only the hash of
 * the token is stored. The state lives here, not in the reader's socket, so any API instance can serve the phone.
 */
@Entity()
@Index('IDX_form_image_handoff_token', ['tokenHash'], { unique: true })
@Index('IDX_form_image_handoff_reader', ['readerId', 'endedAt'])
@Index('IDX_form_image_handoff_expires', ['expiresAt'])
export class FormImageHandoff {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'integer' })
  readerId!: number;

  @ManyToOne(() => Attractap, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'readerId' })
  reader!: Attractap;

  @Column({ type: 'integer' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'integer' })
  resourceId!: number;

  @Column({ type: 'varchar' })
  action!: ResourceFormAction;

  @Column({ type: 'integer' })
  formId!: number;

  @Column({ type: 'integer' })
  fieldId!: number;

  @Column({ type: 'integer' })
  maxImages!: number;

  @Column({ type: 'integer', default: 0 })
  uploadCount!: number;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}

/**
 * A processed image (JPEG, metadata stripped) uploaded for an image field. The file lives in the private form image
 * directory, never under the public CDN. `submissionId` stays null until a submission references it; the cleanup job
 * deletes images that stay unreferenced for a day, and those whose submission was deleted (the column is then reset).
 */
@Entity()
@Index('IDX_form_image_submission', ['submissionId'])
@Index('IDX_form_image_created', ['createdAt'])
@Index('IDX_form_image_handoff', ['handoffId'])
export class FormImage {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  /** The user the image is for: its uploader, or the user of the handoff it came through. */
  @Column({ type: 'integer' })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  /** Null for uploads through a reader handoff link. */
  @Column({ type: 'integer', nullable: true })
  uploadedByUserId!: number | null;

  @Column({ type: 'uuid', nullable: true })
  handoffId!: string | null;

  @ManyToOne(() => FormImageHandoff, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'handoffId' })
  handoff!: FormImageHandoff | null;

  /** Plain ids: forms are deleted softly, and a field removed from a form orphans its images, which are swept. */
  @Column({ type: 'integer' })
  formId!: number;

  @Column({ type: 'integer' })
  fieldId!: number;

  @Column({ type: 'integer', nullable: true })
  submissionId!: number | null;

  @ManyToOne(() => FormSubmission, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'submissionId' })
  submission!: FormSubmission | null;

  @Column({ type: 'varchar' })
  mimeType!: string;

  @Column({ type: 'integer' })
  size!: number;

  @Column({ type: 'integer' })
  width!: number;

  @Column({ type: 'integer' })
  height!: number;

  @Column({ type: 'varchar' })
  filename!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
