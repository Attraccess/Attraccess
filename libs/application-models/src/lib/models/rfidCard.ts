import { User } from './user';

export interface NFCCard {
  id: number;
  uid: string;
  user: User;
  keyNo: number;
  key: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeen: Date;
  isActive: boolean;
}
