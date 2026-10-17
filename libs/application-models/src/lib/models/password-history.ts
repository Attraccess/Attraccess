import { User } from './user';

export interface PasswordHistory {
  id: number;
  userId: number;
  passwordHash: string;
  createdAt: Date;
  user: User;
}
