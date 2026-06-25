import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RolePermission } from './role-permission.entity';
import { UserRole } from './user-role.entity';

@Entity('role')
export class Role {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'Unique identifier of the role',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text', unique: true })
  @ApiProperty({
    description: 'Stable string key for this role',
    example: 'resource-manager',
  })
  key!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Human-readable name of the role',
    example: 'Resource Manager',
  })
  name!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'Description of what this role allows',
    example: 'Can manage all resources in the system',
  })
  description!: string;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether this role is managed by the system and cannot be deleted',
    example: true,
  })
  isSystemManaged!: boolean;

  @Column({ type: 'boolean', default: false })
  @ApiProperty({
    description: 'Whether this role is assigned to all new users by default',
    example: false,
  })
  isDefault!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => RolePermission, (rp) => rp.role, { onDelete: 'CASCADE' })
  rolePermissions!: RolePermission[];

  @OneToMany(() => UserRole, (ur) => ur.role, { onDelete: 'CASCADE' })
  userRoles!: UserRole[];
}
