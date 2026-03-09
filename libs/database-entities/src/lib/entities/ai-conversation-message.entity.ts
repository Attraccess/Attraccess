import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

@Entity()
export class AiConversationMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  conversationId!: number;

  @ManyToOne(() => AiConversation, (conv) => conv.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: AiConversation;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ type: 'simple-json', nullable: true })
  toolCalls!: unknown[] | null;

  @CreateDateColumn()
  createdAt!: Date;
}
