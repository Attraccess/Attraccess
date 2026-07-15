import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Role } from './role.entity';

export enum UserRoleSource {
  MANUAL = 'manual',
  SSO = 'sso',
}

@Entity('user_role')
export class UserRole {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'integer' })
  @ApiProperty({ description: 'ID of the assigned role' })
  roleId!: number;

  @Column({ type: 'text', default: UserRoleSource.MANUAL })
  @ApiProperty({
    description: 'How this role was assigned to the user',
    enum: UserRoleSource,
    example: UserRoleSource.MANUAL,
  })
  source!: UserRoleSource;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'SSO provider type, if source is sso',
    example: 'oidc',
    nullable: true,
    required: false,
  })
  ssoProviderType!: string | null;

  @Column({ type: 'integer', nullable: true })
  @ApiProperty({
    description: 'SSO provider ID, if source is sso',
    nullable: true,
    required: false,
  })
  ssoProviderId!: number | null;

  @Column({ type: 'text', nullable: true })
  @ApiProperty({
    description: 'External value from SSO provider that triggered this assignment',
    nullable: true,
    required: false,
  })
  externalValue!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role!: Role;
}
