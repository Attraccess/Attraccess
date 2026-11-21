// Access to the plugin's backend (`/api/status-wall/*`) through the SDK client, which supplies the host's API origin.
import { createPluginApiClient } from '@attraccess/plugins-frontend-sdk';

export interface WallSelection {
  all: boolean;
  resourceIds: number[];
  groupIds: number[];
}

export interface Wall {
  id: number;
  name: string;
  token: string;
  selection: WallSelection;
  createdAt: string;
  updatedAt: string;
}

export interface WallInput {
  name: string;
  selection: WallSelection;
}

export type ResourceState = 'maintenance' | 'in-use' | 'ready';

export interface WallTile {
  id: number;
  name: string;
  imageUrl: string | null;
  state: ResourceState;
  since: string | null;
}

export interface WallSnapshot {
  name: string;
  generatedAt: string;
  tiles: WallTile[];
}

export interface NamedEntity {
  id: number;
  name: string;
}

const api = createPluginApiClient('/api/status-wall');
const hostApi = createPluginApiClient('');

export const listWalls = () => api.request<Wall[]>('/walls');
export const createWall = (input: WallInput) => api.request<Wall>('/walls', { method: 'POST', body: input });
export const updateWall = (id: number, input: WallInput) =>
  api.request<Wall>(`/walls/${id}`, { method: 'PUT', body: input });
export const regenerateWallLink = (id: number) => api.request<Wall>(`/walls/${id}/regenerate`, { method: 'POST' });
export const deleteWall = (id: number) => api.request<null>(`/walls/${id}`, { method: 'DELETE' });

export const listResourceGroups = () => hostApi.request<NamedEntity[]>('/api/resource-groups');

const publicPath = (token: string) => `/public/${encodeURIComponent(token)}`;
export const getWallSnapshot = (token: string) => api.request<WallSnapshot>(publicPath(token));
export const wallEventsUrl = (token: string) => api.url(`${publicPath(token)}/events`);

/** Resource images are served by the API, which may live on another origin than the app. */
export const imageSrc = (imageUrl: string) => hostApi.url(imageUrl);

/** Path of the public screen of a wall, in this app. */
export const wallPath = (token: string) => `/status-wall/${encodeURIComponent(token)}`;
export const wallLink = (token: string) => `${window.location.origin}${wallPath(token)}`;
