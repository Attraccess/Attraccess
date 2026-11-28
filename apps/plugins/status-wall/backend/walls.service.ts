import { ResourceNotFoundException, type PluginAccessPrincipal } from '@attraccess/plugins-backend-sdk';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Clock, PLUGIN_CONTEXT, STATUS_WALL_CLOCK, type PluginContext } from './constants';
import { tablesOf, type WallRow } from './storage';

/** Which resources a wall shows: every resource, or the listed ones plus all resources of the listed groups. */
export interface WallSelection {
  all: boolean;
  resourceIds: number[];
  groupIds: number[];
}

export interface Wall {
  id: number;
  name: string;
  /** Secret of the public link `/status-wall/<token>`. */
  token: string;
  selection: WallSelection;
  createdAt: Date;
  updatedAt: Date;
}

export interface WallInput {
  name: string;
  selection: WallSelection;
}

/** Shape of every token this service issues (base64url); anything else is answered 404 without a lookup. */
export const WALL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

const newToken = (): string => randomBytes(32).toString('base64url');

const ids = (value: unknown): number[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0))] : [];

/** Reads a stored selection defensively: a malformed value shows nothing rather than everything. */
export function parseSelection(value: unknown): WallSelection {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { all: record.all === true, resourceIds: ids(record.resourceIds), groupIds: ids(record.groupIds) };
}

const toWall = (row: WallRow): Wall => ({
  id: row.id,
  name: row.name,
  token: row.token,
  selection: parseSelection(row.selection),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class WallsService {
  constructor(
    @Inject(PLUGIN_CONTEXT) private readonly context: PluginContext,
    @Inject(STATUS_WALL_CLOCK) private readonly clock: Clock,
  ) {}

  private get walls() {
    return tablesOf(this.context).walls;
  }

  async list(): Promise<Wall[]> {
    const rows = await this.walls.find({ orderBy: [{ field: 'name', direction: 'asc' }] });
    return rows.map(toWall);
  }

  async get(id: number): Promise<Wall> {
    const row = await this.walls.get(id);
    if (!row) throw new NotFoundException();
    return toWall(row);
  }

  /**
   * A manager selects only what they may see themselves: a hidden machine or group answers like a missing one, and
   * "every resource" (which covers future ones too) needs a manager whose machine list is not narrowed. `stored` is
   * the wall's current selection: what was deleted since stays accepted, so the wall can still be edited.
   */
  private async assertSelectable(viewer: PluginAccessPrincipal, selection: WallSelection, stored?: WallSelection) {
    const access = this.context.resourceAccess;
    if (selection.all && (await access.getResourceListScope(viewer)) !== 'all') {
      throw new ForbiddenException('ResourceListNarrowed');
    }
    const resource = await this.refusedResourceId(viewer, selection.resourceIds, stored?.resourceIds ?? []);
    if (resource !== undefined) throw new ResourceNotFoundException(resource);
    if (await this.refusesGroup(viewer, selection.groupIds, stored?.groupIds ?? [])) {
      throw new NotFoundException('ResourceGroupNotFound');
    }
  }

  private async refusedResourceId(viewer: PluginAccessPrincipal, selected: number[], stored: number[]) {
    if (selected.length === 0) return undefined;
    const visible = new Set(await this.context.resourceAccess.filterVisible(viewer, selected));
    const refused = selected.filter((id) => !visible.has(id));
    if (refused.length === 0) return undefined;
    const existing = await this.context.hostData.resources.getNames(refused.filter((id) => stored.includes(id)));
    return refused.find((id) => !stored.includes(id) || existing.has(id));
  }

  private async refusesGroup(viewer: PluginAccessPrincipal, selected: number[], stored: number[]) {
    if (selected.length === 0) return false;
    const visible = new Set(await this.context.resourceAccess.filterVisibleGroups(viewer, selected));
    const refused = selected.filter((id) => !visible.has(id));
    if (refused.some((id) => !stored.includes(id))) return true;
    // The host cannot tell a deleted group from a hidden one; a stored group that shows nothing may stay.
    return refused.length > 0 && (await this.context.hostData.resources.listIdsInGroups(refused)).length > 0;
  }

  async create(viewer: PluginAccessPrincipal, input: WallInput): Promise<Wall> {
    const selection = parseSelection(input.selection);
    await this.assertSelectable(viewer, selection);
    const now = this.clock();
    const row = await this.walls.insert({
      name: input.name.trim(),
      token: newToken(),
      selection,
      createdAt: now,
      updatedAt: now,
    });
    return toWall(row);
  }

  async update(viewer: PluginAccessPrincipal, id: number, input: WallInput): Promise<Wall> {
    const selection = parseSelection(input.selection);
    await this.assertSelectable(viewer, selection, (await this.get(id)).selection);
    const changed = await this.walls.update({ id }, { name: input.name.trim(), selection, updatedAt: this.clock() });
    if (changed === 0) throw new NotFoundException();
    return this.get(id);
  }

  /** Issues a new link; screens showing the old one get a 404 from now on. */
  async regenerateToken(id: number): Promise<Wall> {
    const changed = await this.walls.update({ id }, { token: newToken(), updatedAt: this.clock() });
    if (changed === 0) throw new NotFoundException();
    return this.get(id);
  }

  async delete(id: number): Promise<void> {
    if ((await this.walls.delete({ id })) === 0) throw new NotFoundException();
  }

  /** The wall behind a public link, or null for malformed, unknown and replaced tokens alike. */
  async findByToken(token: string): Promise<Wall | null> {
    if (!WALL_TOKEN_PATTERN.test(token)) return null;
    const row = await this.walls.findOne({ where: { token } });
    return row ? toWall(row) : null;
  }

  /** The ids of the resources the wall shows, or undefined for "every resource". */
  async resourceIdsOf(selection: WallSelection): Promise<number[] | undefined> {
    if (selection.all) return undefined;
    const inGroups = await this.context.hostData.resources.listIdsInGroups(selection.groupIds);
    return [...new Set([...selection.resourceIds, ...inGroups])];
  }
}
