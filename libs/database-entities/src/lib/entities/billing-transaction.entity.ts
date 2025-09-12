import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { ResourceUsage } from './resourceUsage.entity';

@Entity()
export class BillingTransaction {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the billing transaction',
    example: 1,
  })
  id!: number;

  @Column({ type: 'integer' })
  @ApiProperty({
    description: 'The ID of the user',
    example: 1,
  })
  userId!: number;

  @ManyToOne(() => User, (user) => user.billingTransactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The user who the billing transaction belongs to', type: () => User })
  user!: User;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the billing transaction was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the billing transaction was last updated' })
  updatedAt!: Date;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The credit amount of the billing transaction (negative for refunds/top-ups)' })
  amount!: number;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The user ID of the user who caused the billing transaction' })
  initiatorId!: number | null;

  @ManyToOne(() => User, (user) => user.initiatedBillingTransactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'initiatorId' })
  @ApiProperty({ description: 'The user who initiated the billing transaction', type: () => User })
  initiator!: User | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The resource usage ID of the resource usage that caused the billing transaction' })
  resourceUsageId!: number | null;

  @ManyToOne(() => ResourceUsage, (resourceUsage) => resourceUsage.billingTransactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'resourceUsageId' })
  @ApiProperty({ description: 'The resource usage that caused the billing transaction', type: () => ResourceUsage })
  resourceUsage!: ResourceUsage | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({ description: 'The billing transaction ID of the billing transaction that is being refunded' })
  refundOfId!: number | null;

  @ManyToOne(() => BillingTransaction, (billingTransaction) => billingTransaction.refundOf, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'refundOfId' })
  @ApiProperty({ description: 'The billing transaction that is being refunded', type: () => BillingTransaction })
  refundOf!: BillingTransaction | null;
}
