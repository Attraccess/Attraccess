import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Post } from '@nestjs/common';
import type { DiscoveryResult } from './discovery.service';
import { DiscoverBody } from './shelly.contracts';
import { InvalidCidrError } from './network-scan';
import { ShellyControllerState } from './shelly.shelly-controller-state';

export abstract class ShellyControllerDiscoverOperation extends ShellyControllerState {
  // Runs inline rather than as a background job: a /24 is ~250 probes at a 1s
  // timeout and 64 in flight, so a few seconds. Larger subnets are rejected by
  // expandCidr instead of being made asynchronous.
  @Post('discovery')
  async discover(@Body() body: DiscoverBody): Promise<DiscoveryResult> {
    const cidr = (body?.cidr ?? '').trim() || undefined;
    try {
      return await this.discovery.discover(cidr);
    } catch (err) {
      // Only a bad CIDR is operator error; anything else is a real failure and
      // should not be dressed up as a 400.
      if (err instanceof InvalidCidrError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
