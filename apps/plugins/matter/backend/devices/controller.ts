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
import { MatterStateService, type IngestStats } from './state.service';
import { endpointView, nodeDetailView, nodeView } from './views';
import type { StateEntryView } from './state-machine';
import type { z } from 'zod';

/** `where` names the input in messages whose issue has no path: the body, the query or a path parameter. */
function parse<S extends z.ZodType>(schema: S, value: unknown, where = 'body'): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(validationMessages(parsed.error, where));
  return parsed.data;
}

const parseId = (id: string): string => parse(idParamSchema, id, 'id');

export type ReconciliationStatusResponse = ReconciliationStatusView & {
  /** Event counters since the plugin started: applied, and ignored by reason. */
  events: IngestStats;
};

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
    const filter = parse(listQuerySchema, query, 'query');
    return (await this.lifecycle.listNodes(filter)).map(nodeView);
  }

  @Get('nodes/:id')
  async getNode(@Param('id') id: string) {
    return nodeDetailView(await this.lifecycle.getNode(parseId(id)));
  }

  @Patch('nodes/:id')
  async updateNode(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.updateNode(parseId(id), parse(metadataSchema, body), principalOf(request)));
  }

  @Post('nodes/:id/claim')
  @HttpCode(200)
  async claim(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.claim(parseId(id), parse(claimSchema, body ?? {}), principalOf(request)));
  }

  @Post('nodes/:id/relink')
  @HttpCode(200)
  async relink(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.relink(parseId(id), parse(relinkSchema, body), principalOf(request)));
  }

  @Post('nodes/:id/repair')
  @HttpCode(200)
  async repair(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.repair(parseId(id), principalOf(request)));
  }

  @Post('nodes/:id/archive')
  @HttpCode(200)
  async archive(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.archive(parseId(id), principalOf(request)));
  }

  @Post('nodes/:id/restore')
  @HttpCode(200)
  async restore(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return nodeView(await this.lifecycle.restore(parseId(id), principalOf(request)));
  }

  @Post('nodes/:id/force-remove')
  @HttpCode(200)
  async forceRemove(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    parse(forceRemoveSchema, body);
    return nodeView(await this.lifecycle.forceRemove(parseId(id), principalOf(request)));
  }

  @Patch('endpoints/:id')
  async updateEndpoint(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return endpointView(
      await this.lifecycle.updateEndpoint(parseId(id), parse(metadataSchema, body), principalOf(request)),
    );
  }

  @Get('endpoints/:id/state')
  async endpointState(@Param('id') id: string): Promise<{ endpointRef: string; states: StateEntryView[] }> {
    const endpoint = await this.lifecycle.getEndpoint(parseId(id));
    return { endpointRef: endpoint.id, states: await this.state.read(endpoint.id) };
  }

  @Get('reconciliation')
  async reconciliationStatus(): Promise<ReconciliationStatusResponse> {
    return { ...(await this.reconciliation.status()), events: { ...this.state.stats } };
  }

  /** Runs a reconciliation now (or joins the one in progress) and returns the resulting status. */
  @Post('reconciliation')
  @HttpCode(200)
  async trigger(@Req() request: AuthenticatedRequest): Promise<ReconciliationStatusResponse> {
    return { ...(await this.reconciliation.request(principalOf(request))), events: { ...this.state.stats } };
  }
}
