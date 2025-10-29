import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { AuthenticationType, User } from '@attraccess/database-entities';

class UnknownUserOrPasswordException extends UnauthorizedException {
  constructor() {
    super('UnkownUserOrPasswordException');
    super.name = 'UnknownUserOrPasswordException';
  }
}

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(username: string, password: string): Promise<User> {
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

    return user;
  }
}
