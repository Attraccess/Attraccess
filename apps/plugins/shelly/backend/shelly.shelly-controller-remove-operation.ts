import { Delete } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { ShellyControllerSetAuthOperation } from './shelly.shelly-controller-set-auth-operation';

export abstract class ShellyControllerRemoveOperation extends ShellyControllerSetAuthOperation {
  @Delete('devices/:id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ deleted: boolean }> {
    if (!(await this.registry.findById(id))) {
      throw new NotFoundException(`device ${id} not found`);
    }
    await this.registry.delete(id);
    return { deleted: true };
  }
}
