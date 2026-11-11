import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { principalOf } from '../connection/controller';
import { validationMessages } from '../connection/validation';
import { MatterLifecycleService } from './lifecycle.service';
import { MatterReconciliationService, type ReconciliationStatusView } from './reconciliation.service';
import {
  claimSchema,
  forceRemoveSchema,
  idParamSchema,
  listQuerySchema,
  metadataSchema,
  relinkSchema,
} from './schemas';
import { MatterStateService } from './state.service';
import { endpointView, nodeDetailView, nodeView } from './views';
import type { StateEntryView } from './state-machine';
import type { z } from 'zod';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(validationMessages(parsed.error));
  return parsed.data;
}

/**
 * Admin REST API for Matter nodes and endpoints. No endpoint here sends a command to a device.
 */
// TODO(ATT-1003): replace system.plugins.manage with a dedicated Matter permission
@Auth('system.plugins.manage')
@Controller('matter')
export class MatterDevicesController {
  constructor(
    @Inject(MatterLifecycleService) private readonly lifecycle: MatterLifecycleService,
    @Inject(MatterReconciliationService) private readonly reconciliation: MatterReconciliationService,
    @Inject(MatterStateService) private readonly state: MatterStateService,
  ) {}

  @Get('nodes')
  async listNodes(@Query() query: unknown) {
    const filter = parse(listQuerySchema, query);
    return (await this.lifecycle.listNodes(filter)).map(nodeView);
  }

  @Get('nodes/:id')
  async getNode(@Param('id') id: string) {
    return nodeDetailView(await this.lifecycle.getNode(parse(idParamSchema, id)));
  }

  @Patch('nodes/:id')
  async updateNode(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(
      await this.lifecycle.updateNode(parse(idParamSchema, id), parse(metadataSchema, body), principalOf(request)),
    );
  }

  @Post('nodes/:id/claim')
  @HttpCode(200)
  async claim(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(
      await this.lifecycle.claim(parse(idParamSchema, id), parse(claimSchema, body ?? {}), principalOf(request)),
    );
  }

  @Post('nodes/:id/relink')
  @HttpCode(200)
  async relink(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(
      await this.lifecycle.relink(parse(idParamSchema, id), parse(relinkSchema, body), principalOf(request)),
    );
  }

  @Post('nodes/:id/repair')
  @HttpCode(200)
  async repair(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.repair(parse(idParamSchema, id), principalOf(request)));
  }

  @Post('nodes/:id/archive')
  @HttpCode(200)
  async archive(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.archive(parse(idParamSchema, id), principalOf(request)));
  }

  @Post('nodes/:id/restore')
  @HttpCode(200)
  async restore(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.restore(parse(idParamSchema, id), principalOf(request)));
  }

  @Post('nodes/:id/force-remove')
  @HttpCode(200)
  async forceRemove(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    parse(forceRemoveSchema, body);
    return nodeView(await this.lifecycle.forceRemove(parse(idParamSchema, id), principalOf(request)));
  }

  @Patch('endpoints/:id')
  async updateEndpoint(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return endpointView(
      await this.lifecycle.updateEndpoint(parse(idParamSchema, id), parse(metadataSchema, body), principalOf(request)),
    );
  }

  @Get('endpoints/:id/state')
  async endpointState(@Param('id') id: string): Promise<{ endpointId: string; states: StateEntryView[] }> {
    const endpoint = await this.lifecycle.getEndpoint(parse(idParamSchema, id));
    return { endpointId: endpoint.id, states: await this.state.read(endpoint.id) };
  }

  @Get('reconciliation')
  reconciliationStatus(): Promise<ReconciliationStatusView> {
    return this.reconciliation.status();
  }

  /** Runs a reconciliation now (or joins the one in progress) and returns the resulting status. */
  @Post('reconciliation')
  @HttpCode(200)
  trigger(@Req() request: AuthenticatedRequest): Promise<ReconciliationStatusView> {
    return this.reconciliation.request(principalOf(request));
  }
}
