import { Entity, ManyToOne, JoinColumn, PrimaryColumn } from 'typeorm';
import { Role } from './role.entity';

/** An action the members of a role may perform from outside the allowed network. One row per role and action. */
@Entity('role_network_action')
export class RoleNetworkAction {
  @PrimaryColumn({ type: 'integer' })
  roleId!: number;

  @PrimaryColumn({ type: 'text' })
  action!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role!: Role;
}
