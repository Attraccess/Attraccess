import { TypeOrmRbacStore } from '../../../database/adapters/users/typeorm-rbac.store';
import { TypeOrmUserStore } from '../../../database/adapters/users/typeorm-user.store';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { TransactionContextResolver } from '../../../database/adapters/transaction-context';
import { UserAccounts } from '../accounts/user-accounts';
import { UserDirectory } from '../directory/user-directory';
import { UsersService } from '../users.service';

/**
 * Builds UsersService and its collaborators on a real SQLite connection without Nest. The connection comes from the
 * user repository the caller already holds; the other positional arguments keep the order the service's constructor
 * had before it was split into collaborators and put behind the user store (the unused ones are ignored).
 */
export function composeUsersService(
  userRepository: unknown,
  _authenticationDetailRepository: unknown,
  _sessionRepository: unknown,
  _resourceUsageRepository: unknown,
  licenseService: unknown,
  emailService: unknown,
  dataSource: unknown,
  tokenHashService: unknown,
  metricsService: unknown,
  rbacService: unknown,
  _settingsService: unknown,
): UsersService {
  const source = (dataSource ?? (userRepository as { manager: { connection: unknown } }).manager.connection) as never;
  const unitOfWork = unitOfWorkFor(source);
  const transactions = new TransactionContextResolver(source, unitOfWork);
  const store = new TypeOrmUserStore(source, transactions);
  const accounts = new UserAccounts(
    store,
    licenseService as never,
    unitOfWork,
    metricsService as never,
    rbacService as never,
  );
  const directory = new UserDirectory(store, accounts, emailService as never, unitOfWork);
  return new UsersService(
    store,
    licenseService as never,
    emailService as never,
    unitOfWork,
    tokenHashService as never,
    metricsService as never,
    rbacService as never,
    accounts,
    directory,
    new TypeOrmRbacStore(source, transactions),
  );
}
