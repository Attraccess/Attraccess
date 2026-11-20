import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Unique('UQ_role_permission', ['roleId', 'permissionKey'])
@Index('IDX_role_permission_role', ['roleId'])
@Index('IDX_role_permission_permissionKey', ['permissionKey'])
@Entity('role_permission')
export class RolePermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  roleId!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The permission key granted by this assignment',
    example: 'resources.read',
  })
  permissionKey!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role!: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionKey', referencedColumnName: 'key' })
  permission!: Permission;
}
