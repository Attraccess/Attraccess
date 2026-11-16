import { UserAccounts } from '../accounts/user-accounts';
import { UserDirectory } from '../directory/user-directory';
import { UsersService } from '../users.service';

/**
 * Builds UsersService and its collaborators without Nest, taking the dependencies in the order the service's
 * constructor took them before it was split into collaborators (the unused repositories and settings included).
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
  const accounts = new UserAccounts(
    userRepository as never,
    licenseService as never,
    dataSource as never,
    metricsService as never,
    rbacService as never,
  );
  const directory = new UserDirectory(userRepository as never, accounts, emailService as never, dataSource as never);
  return new UsersService(
    userRepository as never,
    licenseService as never,
    emailService as never,
    dataSource as never,
    tokenHashService as never,
    metricsService as never,
    rbacService as never,
    accounts,
    directory,
  );
}
