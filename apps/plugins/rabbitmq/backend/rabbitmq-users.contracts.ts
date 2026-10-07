export // Body of PUT /api/users/:name. RabbitMQ replaces the whole user record, so an
// update that should keep the password re-sends the stored hash.
interface PutUserBody {
  tags: string;
  password?: string;
  password_hash?: string;
  hashing_algorithm?: string;
}
export interface RawPermission {
  user: string;
  vhost: string;
  configure: string;
  write: string;
  read: string;
}
export // Raw shapes returned by the RabbitMQ management API. Only the fields we read.
interface RawUser {
  name: string;
  // Array on RabbitMQ >= 3.9, comma-separated string on older brokers.
  tags?: string[] | string;
  password_hash?: string;
  hashing_algorithm?: string;
}
export interface RawVhost {
  name: string;
}
