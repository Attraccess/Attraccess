import { User } from '@attraccess/database-entities';
import { ReactNode } from 'react';
import { IPlugin } from 'react-pluggable';
import { RouteConfig } from './frontend.routing';
import { PluginSlotContribution } from './frontend.slots';

export enum FrontendLocation {}

export enum FRONTEND_FUNCTION {
  GET_ROUTES = 'GET_ROUTES',
  GET_SIDEBAR_ITEMS = 'GET_SIDEBAR_ITEMS',
  GET_SLOT_CONTRIBUTIONS = 'GET_SLOT_CONTRIBUTIONS',
}

// A navigation entry a plugin contributes to the app sidebar. The host renders
// `label` with `icon` and links to `path` (which should match a route the
// plugin returns from getRoutes()). Route-level `authRequired` still gates
// visibility, so an entry never points at a page the user cannot open.
export interface PluginSidebarItem {
  label: string;
  path: string;
  icon?: ReactNode;
}

export const getPluginFunctionName = (pluginName: string, func: FRONTEND_FUNCTION) => {
  return `${pluginName}.${func}`;
};

export interface AttraccessFrontendPluginAuthData {
  authToken: string;
  user: User;
}

export interface AttraccessFrontendPlugin extends IPlugin {
  onApiAuthStateChange(authData: null | AttraccessFrontendPluginAuthData): void;
  onApiEndpointChange(endpoint: string): void;
  // Optional. Return the routes this plugin contributes to the app router.
  getRoutes?(): RouteConfig[];
  // Optional. Return the sidebar navigation entries this plugin contributes.
  getSidebarItems?(): PluginSidebarItem[];
  // Optional. Return the contributions this plugin renders into host slots
  // (generic embedded extension points). See frontend.slots.ts.
  getSlotContributions?(): PluginSlotContribution[];
}
