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
import { User } from './user.entity';
import { AiConversationMessage } from './ai-conversation-message.entity';

@Entity()
export class AiConversation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer', unique: true })
  userId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'text', nullable: true })
  title!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => AiConversationMessage, (msg) => msg.conversation, { cascade: true })
  messages!: AiConversationMessage[];
}
