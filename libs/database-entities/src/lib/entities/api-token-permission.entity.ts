import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Index, Unique } from 'typeorm';
import { ApiToken } from './api-token.entity';
import { Permission } from './permission.entity';

@Unique('UQ_api_token_permission', ['apiTokenId', 'permissionKey'])
@Index('IDX_api_token_permission_token', ['apiTokenId'])
@Index('IDX_api_token_permission_permission', ['permissionKey'])
@Entity('api_token_permission')
export class ApiTokenPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  apiTokenId!: number;

  @Column({ type: 'text' })
  permissionKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => ApiToken, (apiToken) => apiToken.apiTokenPermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apiTokenId' })
  apiToken!: ApiToken;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionKey', referencedColumnName: 'key' })
  permission!: Permission;
}
