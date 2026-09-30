import { Column, CreateDateColumn, Entity, Index, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from './user.entity';
import { ApiTokenPermission } from './api-token-permission.entity';

@Entity('api_token')
@Index(['tokenHash'], { unique: true })
@Index(['userId'])
export class ApiToken {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  @Exclude()
  tokenHash!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  revokedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.apiTokens, { onDelete: 'CASCADE' })
  user!: User;

  @OneToMany(() => ApiTokenPermission, (apiTokenPermission) => apiTokenPermission.apiToken, { onDelete: 'CASCADE' })
  apiTokenPermissions!: ApiTokenPermission[];

  get permissionKeys(): string[] {
    return this.apiTokenPermissions.map(({ permissionKey }) => permissionKey);
  }
}
