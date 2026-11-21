import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '@attraccess/database-entities';
import { NotificationRecipient } from '@attraccess/application-models';
import { Repository } from 'typeorm';
import { EmailRecipientDirectory } from '../../../email/email-recipient-directory.port';

@Injectable()
export class TypeOrmEmailRecipientDirectory implements EmailRecipientDirectory {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async findById(id: number): Promise<NotificationRecipient | null> {
    const user = await this.users.findOne({ where: { id } });
    return user
      ? {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          locale: user.locale,
        }
      : null;
  }
}
