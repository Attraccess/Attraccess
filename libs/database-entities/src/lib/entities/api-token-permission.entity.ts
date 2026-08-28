import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiToken } from './api-token.entity';
import { Permission } from './permission.entity';

@Entity('api_token_permission')
export class ApiTokenPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  apiTokenId!: number;

  @Column({ type: 'text' })
  permissionKey!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => ApiToken, (apiToken) => apiToken.apiTokenPermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apiTokenId' })
  apiToken!: ApiToken;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionKey', referencedColumnName: 'key' })
  permission!: Permission;
}
