import { INestApplication } from '@nestjs/common';
import { bootstrap } from '../main.bootstrap';
import request from 'supertest';
import { AuthenticationType, User } from '@attraccess/database-entities';
import { UsersService } from '../users-and-auth/users/users.service';
import { AuthService } from '../users-and-auth/auth/auth.service';
import { SessionService } from '../users-and-auth/auth/session.service';
import { nanoid } from 'nanoid';

export class TestSetup {
  private static app: INestApplication;
  private static instantiations = 0;
  protected static usersService: UsersService;
  protected static authService: AuthService;
  protected static sessionService: SessionService;
  public testInstanceIdentifier: string;

  public constructor() {
    this.testInstanceIdentifier = nanoid(4);
  }

  private users: User[] = [];

  async initApp() {
    TestSetup.instantiations++;

    if (!TestSetup.app) {
      const { app } = await bootstrap();
      TestSetup.app = app;
      await app.init();
      TestSetup.usersService = app.get(UsersService);
      TestSetup.authService = app.get(AuthService);
      TestSetup.sessionService = app.get(SessionService);
    }

    let waitTime = 0;
    const TIMEOUT = 20000;
    while (!(await this.appIsRunning())) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitTime += 1000;
      if (waitTime > TIMEOUT) {
        throw new Error('API did not start in time');
      }
    }

    return TestSetup.app;
  }

  async appIsRunning() {
    // verify api is running by calling the /api/ping endpoint
    const response = await this.getRequest().get('/api/ping');
    return response.status === 200;
  }

  async createUser(username: string, permissions?: User['systemPermissions']) {
    let user = await TestSetup.usersService.createOne({
      username: `${username}-${this.testInstanceIdentifier}`,
      email: `${username}-${this.testInstanceIdentifier}@attraccess.org`,
      externalIdentifier: null,
    });

    if (permissions) {
      user = await TestSetup.usersService.updateOne(user.id, {
        systemPermissions: permissions,
      });
    }

    await TestSetup.authService.addAuthenticationDetails(user.id, {
      type: AuthenticationType.LOCAL_PASSWORD,
      details: {
        password: `password-for-${username}-${this.testInstanceIdentifier}`,
      },
    });

    this.users.push(user);
    return user;
  }

  async getAuthToken(username: string) {
    let user = this.users.find((user) => user.username === username);
    if (!user) {
      user = await TestSetup.usersService.findOne({ username });

      if (!user) {
        throw new Error(`User ${username} not found`);
      }

      this.users.push(user);
    }

    return await TestSetup.sessionService.createSession(user, {
      userAgent: 'test-user-agent',
      ipAddress: '127.0.0.1',
    });
  }

  async cleanupApp() {
    TestSetup.instantiations--;

    await Promise.all(
      this.users.map(async (user) => {
        if (!user) {
          return;
        }

        await TestSetup.usersService.deleteOne(user.id);
      })
    );

    if (TestSetup.instantiations > 0) {
      return;
    }

    if (TestSetup.app) {
      await TestSetup.app.close();
      TestSetup.app = null;
    }
  }

  getRequest() {
    return request(TestSetup.app.getHttpServer());
  }
}
