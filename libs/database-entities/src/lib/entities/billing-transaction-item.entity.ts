import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BillingTransaction } from './billing-transaction.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class BillingTransactionItem {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the billing transaction item', example: 1 })
  id!: number;

  @Column()
  @ApiProperty({ description: 'The ID of the billing transaction', example: 1 })
  billingTransactionId!: number;

  @ManyToOne(() => BillingTransaction, (billingTransaction) => billingTransaction.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'billingTransactionId' })
  @ApiProperty({ description: 'The billing transaction', type: () => BillingTransaction })
  billingTransaction!: BillingTransaction;

  @Column()
  @ApiProperty({ description: 'The name of the billing transaction item', example: 'Credit top-up' })
  name!: string;

  @Column({ nullable: true })
  @ApiProperty({
    description: 'The description of the billing transaction item',
    example: 'Credit top-up for user 1',
    nullable: true,
  })
  description!: string | null;

  @Column({ nullable: true })
  @ApiProperty({
    description: 'The external reference of the billing transaction item',
    example: '1234567890',
    nullable: true,
  })
  externalReference!: string | null;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'The value of the billing transaction item', example: '100' })
  value!: number;
}
