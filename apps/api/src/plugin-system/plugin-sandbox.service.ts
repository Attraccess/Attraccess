import { Injectable } from '@nestjs/common';
import { isPluginPermission, PluginPermission } from '@attraccess/plugins-backend-sdk/v2';

@Injectable()
export class PluginSandboxService {
  /**
   * Validates the permissions declared in a manifest. Returns the parsed set or
   * throws guidance on the first unknown value.
   */
  public static validateDeclaredPermissions(pluginName: string, declared: unknown): PluginPermission[] {
    if (declared === undefined || declared === null) {
      return [];
    }

    if (!Array.isArray(declared)) {
      throw new Error(`Plugin "${pluginName}" manifest field "permissions" must be an array of strings.`);
    }

    const result: PluginPermission[] = [];
    for (const value of declared) {
      if (typeof value !== 'string' || !isPluginPermission(value)) {
        throw new Error(
          `Plugin "${pluginName}" declares unknown permission "${String(value)}". ` +
            `Valid permissions are: ${Object.values(PluginPermission).join(', ')}.`,
        );
      }
      if (!result.includes(value)) {
        result.push(value);
      }
    }

    return result;
  }
}
