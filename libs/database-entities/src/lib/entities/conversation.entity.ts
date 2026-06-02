import { Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Conversation {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The unique identifier of the conversation', example: 1 })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({
    description: 'When this conversation was created',
    example: '2025-01-18T12:00:00.000Z',
  })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({
    description: 'When this conversation was last updated',
    example: '2025-01-18T12:30:00.000Z',
  })
  updatedAt!: Date;
}
