import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { ResourceIntroduction } from './resourceIntroduction.entity';
import { User } from './user.entity';

export enum IntroductionHistoryAction {
  REVOKE = 'revoke',
  GRANT = 'grant',
}

@Entity()
export class ResourceIntroductionHistoryItem {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the introduction history entry',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the related introduction',
    example: 1,
  })
  introductionId!: number;

  @Column({
    type: 'simple-enum',
    enum: IntroductionHistoryAction,
  })
  @ApiProperty({
    description: 'The action performed (revoke or grant)',
    enum: IntroductionHistoryAction,
    example: IntroductionHistoryAction.REVOKE,
    enumName: 'IntroductionHistoryAction',
  })
  action!: IntroductionHistoryAction;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user who performed the action',
    example: 1,
  })
  performedByUserId!: number;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'Optional comment explaining the reason for the action',
    example: 'User no longer requires access to this resource',
    required: false,
  })
  comment!: string | null;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When the action was performed',
    example: '2021-01-01T00:00:00.000Z',
  })
  createdAt!: Date;

  @ManyToOne(() => ResourceIntroduction, (introduction) => introduction.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'introductionId' })
  introduction!: ResourceIntroduction;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedByUserId' })
  @ApiProperty({
    description: 'The user who performed the action',
    type: () => User,
  })
  performedByUser!: User;
}
