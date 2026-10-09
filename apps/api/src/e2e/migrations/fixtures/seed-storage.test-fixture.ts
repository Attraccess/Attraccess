import { User } from '@attraccess/database-entities';
import type { DataSource, DeepPartial, Repository } from 'typeorm';
export type NoInfer<T> = [T][T extends unknown ? 0 : never];
export const ensureEntity = async <T>(repo: Repository<T>, builder: () => DeepPartial<NoInfer<T>>): Promise<T> => {
  const [existing] = await repo.find({ take: 1 });
  if (existing) {
    return existing;
  }

  return repo.save(repo.create(builder()));
};
export const ensureUsers = async (dataSource: DataSource, seedTag: string) => {
  const userRepo = dataSource.getRepository(User);
  let users = await userRepo.find({ take: 2, order: { id: 'ASC' } });
  const newUsers: DeepPartial<User>[] = [];

  if (users.length < 1) {
    newUsers.push({
      username: `seed_user_${seedTag}_1`,
      email: `seed_user_${seedTag}_1@example.com`,
    });
  }

  if (users.length < 2) {
    newUsers.push({
      username: `seed_user_${seedTag}_2`,
      email: `seed_user_${seedTag}_2@example.com`,
    });
  }

  if (newUsers.length > 0) {
    const savedUsers = await userRepo.save(newUsers.map((user) => userRepo.create(user)));
    users = [...users, ...savedUsers];
  }

  if (!users[0]) {
    throw new Error('Failed to seed users for migration test');
  }

  return { primaryUser: users[0], secondaryUser: users[1] ?? users[0] };
};
