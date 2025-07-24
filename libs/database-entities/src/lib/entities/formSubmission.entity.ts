import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { FormTemplate } from './formTemplate.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { User } from './user.entity';

@Entity()
@Index(['templateId'])
@Index(['resourceUsageId'], { unique: true })
@Index(['userId'])
@Index(['submittedAt'])
export class FormSubmission {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the form submission',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the form template used for this submission',
    example: 1,
  })
  templateId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the resource usage session this submission is associated with',
    example: 1,
  })
  resourceUsageId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user who submitted the form',
    example: 1,
  })
  userId!: number;

  @Column({ type: 'json' })
  @ApiProperty({
    description: 'The submitted form data as key-value pairs',
    example: {
      safety_equipment_checked: true,
      estimated_duration: 120,
      project_description: 'Printing prototype parts for client presentation',
    },
  })
  submissionData!: Record<string, string | number | boolean | null>;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the form was submitted',
  })
  submittedAt!: Date;

  @ManyToOne(() => FormTemplate, (template) => template.submissions, { 
    onDelete: 'CASCADE' 
  })
  @JoinColumn({ name: 'templateId' })
  @ApiProperty({
    description: 'The form template used for this submission',
    type: () => FormTemplate,
  })
  template!: FormTemplate;

  @OneToOne(() => ResourceUsage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resourceUsageId' })
  @ApiProperty({
    description: 'The resource usage session this submission is associated with',
    type: () => ResourceUsage,
  })
  resourceUsage!: ResourceUsage;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({
    description: 'The user who submitted the form',
    type: () => User,
  })
  user!: User;
}