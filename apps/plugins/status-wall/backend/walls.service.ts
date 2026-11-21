import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(input: WallInput): Promise<Wall> {
    const now = this.clock();
    const row = await this.walls.insert({
      name: input.name.trim(),
      token: newToken(),
      selection: parseSelection(input.selection),
      createdAt: now,
      updatedAt: now,
    });
    return toWall(row);
  }

  async update(id: number, input: WallInput): Promise<Wall> {
    const changed = await this.walls.update(
      { id },
      { name: input.name.trim(), selection: parseSelection(input.selection), updatedAt: this.clock() },
    );
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
