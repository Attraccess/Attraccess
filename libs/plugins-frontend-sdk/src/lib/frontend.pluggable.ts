import { User } from '@attraccess/database-entities';
import { IPlugin } from 'react-pluggable';
import { RouteConfig } from './frontend.routing';

export enum FrontendLocation {}

export enum FRONTEND_FUNCTION {
  GET_ROUTES = 'GET_ROUTES',
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
}
