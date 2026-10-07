import { Mutex } from 'async-mutex';
export interface RabbitmqPermissions {
  configure: string;
  write: string;
  read: string;
}
export interface RabbitmqTopicPermissions {
  exchange: string;
  write: string;
  read: string;
}

export interface VhostLock {
  mutex: Mutex;
  users: number;
}
