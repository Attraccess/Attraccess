import type { User } from '@attraccess/application-models';

export abstract class EmailRecipientPersistence {
  abstract user(id: number): Promise<User | null>;
}
