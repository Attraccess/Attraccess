import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

export type DashboardPinItemType = 'page' | 'resource' | 'widget';

/** One entry on a user's personal dashboard: a page path, a resource id or a widget id, in the user's order. */
@Entity()
@Index('IDX_dashboard_pin_user_position', ['userId', 'position'], { unique: true })
@Index('IDX_dashboard_pin_user_item', ['userId', 'itemType', 'itemId'], { unique: true })
export class DashboardPin {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'text' })
  itemType!: DashboardPinItemType;

  /** The route path of a page pin, the decimal id of a resource pin, or the id of a widget pin. */
  @Column({ type: 'text' })
  itemId!: string;

  @Column({ type: 'integer' })
  position!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}
