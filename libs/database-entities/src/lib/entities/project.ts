import { ApiProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, UpdateDateColumn } from 'typeorm';
import { PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { ResourceUsage } from './resourceUsage.entity';
import { ProjectMember } from './project-member.entity';
import { ProjectInvitation } from './project-invitation.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  @ApiProperty({ description: 'The ID of the project' })
  id!: number;

  @CreateDateColumn()
  @ApiProperty({ description: 'The date and time the NFC card was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'The date and time the NFC card was last updated' })
  updatedAt!: Date;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  @ApiProperty({
    description: 'The date and time the project was archived',
    required: false,
    nullable: true,
  })
  archivedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.ownedProjects)
  @JoinColumn({ name: 'userId' })
  @ApiProperty({ description: 'The ID of the user that owns the project', type: () => User })
  owner!: User;

  @Column({
    type: 'text',
    nullable: false,
  })
  @ApiProperty({ description: 'The name of the project' })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  @ApiProperty({ description: 'The description of the project' })
  description!: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  @ApiProperty({ description: 'The logo of the project' })
  logo!: string | null;

  @OneToMany(() => ResourceUsage, (usage) => usage.project)
  resourceUsages!: ResourceUsage[];

  @OneToMany(() => ProjectMember, (member) => member.project)
  @ApiProperty({ description: 'Members that have access to the project', type: () => [ProjectMember] })
  members!: ProjectMember[];

  @OneToMany(() => ProjectInvitation, (invitation) => invitation.project)
  @ApiProperty({ description: 'Pending invitations for the project', type: () => [ProjectInvitation] })
  invitations!: ProjectInvitation[];
}
