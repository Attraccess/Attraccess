import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
@Index(['userId', 'position'], { unique: true })
@Index(['userId', 'itemType', 'itemId'], { unique: true })
export class DashboardPin {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'integer' }) userId!: number;
  @Column({ type: 'text' }) itemType!: 'page' | 'resource';
  @Column({ type: 'text' }) itemId!: string;
  @Column({ type: 'integer' }) position!: number;
}
