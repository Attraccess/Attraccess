import { Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

export abstract class UserRegistrationServiceRouteContext {
  protected abstract readonly usersService: UsersService;
  protected abstract readonly logger: Logger;
  protected abstract readonly authService: AuthService;
  protected abstract readonly emailService: EmailService;
  protected abstract firstTimeSetupOverwriteLock: Promise<void>;
}
