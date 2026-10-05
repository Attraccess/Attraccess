import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, NFCCard } from '@attraccess/plugins-backend-sdk';
import { AttractapService } from './attractap.service';
import { UsersService } from '../users-and-auth/users/users.service';

@Injectable()
export class CardAccessService {
  constructor(
    private readonly attractapService: AttractapService,
    private readonly usersService: UsersService,
  ) {}

  private assertOwnerOrManager(ownerId: number, actor: AuthenticatedUser): void {
    if (ownerId !== actor.id && !actor.effectivePermissions?.has('users.rfid-cards.manage')) {
      throw new ForbiddenException("You cannot manage another user's RFID cards");
    }
  }

  async resolveUserId(actor: AuthenticatedUser, userId?: number): Promise<number> {
    const ownerId = userId ?? actor.id;
    this.assertOwnerOrManager(ownerId, actor);
    if (ownerId !== actor.id && !(await this.usersService.findOne({ id: ownerId }))) {
      throw new NotFoundException(`User ${ownerId} not found`);
    }
    return ownerId;
  }

  async getCardForManagement(id: number, actor: AuthenticatedUser): Promise<NFCCard> {
    const card = await this.attractapService.getNFCCardByID(id);
    if (!card) throw new NotFoundException(`RFID card ${id} not found`);
    this.assertOwnerOrManager(card.user?.id, actor);
    return card;
  }
}
