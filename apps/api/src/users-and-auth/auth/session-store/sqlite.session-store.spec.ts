import { Repository } from 'typeorm';
import { Session, User } from '@attraccess/database-entities';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { SqliteSessionStore } from './sqlite.session-store';

describe('SqliteSessionStore', () => {
  let store: SqliteSessionStore;
  let repo: jest.Mocked<Repository<Session>>;
  let tokenHashService: jest.Mocked<TokenHashService>;
  let queryBuilder: { delete: jest.Mock; from: jest.Mock; where: jest.Mock; andWhere: jest.Mock; execute: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' } as User;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Session>>;
    queryBuilder = {
      delete: jest.fn(), from: jest.fn(), where: jest.fn(), andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    for (const method of [queryBuilder.delete, queryBuilder.from, queryBuilder.where, queryBuilder.andWhere]) {
      method.mockReturnValue(queryBuilder);
    }
    repo.createQueryBuilder.mockReturnValue(queryBuilder as never);

    tokenHashService = {
      hashToken: jest.fn().mockImplementation((t: string) => `hashed:${t}`),
    } as unknown as jest.Mocked<TokenHashService>;

    store = new SqliteSessionStore(repo, tokenHashService);
  });

  describe('validateSession — lastAccessedAt throttle', () => {
    function makeSession(lastAccessedAt: Date | null, expiresOffsetMs = 3600_000): Session {
      return {
        token: 'hashed:tok',
        userId: 1,
        user: mockUser,
        expiresAt: new Date(Date.now() + expiresOffsetMs),
        lastAccessedAt,
      } as unknown as Session;
    }

    it('writes lastAccessedAt when it is null', async () => {
      const session = makeSession(null);
      repo.findOne.mockResolvedValue(session);
      repo.save.mockResolvedValue(session);

      await store.validateSession('tok');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ lastAccessedAt: expect.any(Date) }));
    });

    it('writes lastAccessedAt when last access was >60s ago', async () => {
      const session = makeSession(new Date(Date.now() - 61_000));
      repo.findOne.mockResolvedValue(session);
      repo.save.mockResolvedValue(session);

      await store.validateSession('tok');

      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ lastAccessedAt: expect.any(Date) }));
    });

    it('skips DB write when last access was <60s ago', async () => {
      const session = makeSession(new Date(Date.now() - 10_000));
      repo.findOne.mockResolvedValue(session);

      await store.validateSession('tok');

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns null without writing when session is expired', async () => {
      const session = makeSession(null, -1000);
      repo.findOne.mockResolvedValue(session);

      const result = await store.validateSession('tok');

      expect(result).toBeNull();
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.remove).toHaveBeenCalledWith(session);
    });
  });

  it('atomically consumes a live session at most once', async () => {
    expect(await store.consumeSession('single-use')).toBe(true);
    expect(repo.createQueryBuilder).toHaveBeenCalled();
    expect(queryBuilder.delete).toHaveBeenCalled();
    expect(queryBuilder.where).toHaveBeenCalledWith('(token = :hashed OR token = :token)', {
      hashed: 'hashed:single-use', token: 'single-use',
    });
    queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });
    expect(await store.consumeSession('single-use')).toBe(false);
  });
});
