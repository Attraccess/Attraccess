import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { AuthenticationType, User, UserType } from '@attraccess/database-entities';
import { TwoFactorService } from '../auth/two-factor.service';

class UnknownUserOrPasswordException extends UnauthorizedException {
  constructor() {
    super('UnkownUserOrPasswordException');
    super.name = 'UnknownUserOrPasswordException';
  }
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private twoFactorService: TwoFactorService,
  ) {
    super({ passReqToCallback: true });
  }

  async validate(request: Request, username: string, password: string): Promise<User> {
    username = username.trim();
    if (username.length === 0) {
      throw new BadRequestException('Username cannot be empty');
    }

    const user = await this.authService.getUserByUsernameAndAuthenticationDetails(username, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password,
      },
    });

    if (!user) {
      throw new UnknownUserOrPasswordException();
    }

    // Guests authenticate via TOTP at terminals only — never via web login.
    if (user.userType === UserType.GUEST) {
      throw new UnknownUserOrPasswordException();
    }

    await this.twoFactorService.assertTwoFactorForLogin(user, request?.body?.twoFactorCode);

    return user;
  }
}
