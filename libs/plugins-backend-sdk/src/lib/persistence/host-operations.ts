import type { Resource, ResourceFlowNode } from '@attraccess/application-models';

/** Small public identity projection. Authentication details and secrets are never returned. */
export interface PluginUserSummary {
  readonly id: number;
  readonly username: string;
}

export interface PluginHostOperations {
  readonly users: {
    /** Requires READ_USERS. Results retain the host's existing user ordering. */
    list(input: { readonly limit: 1 | 2 | 3 | 4 | 5 }): Promise<readonly PluginUserSummary[]>;
  };
  readonly resources: {
    /** Requires ACCESS_RESOURCES. Missing or deleted resources return null. */
    findById(id: number): Promise<Resource | null>;
  };
  readonly flows: {
    /** Requires ACCESS_RESOURCES. Only persisted configuration is returned; no flow is executed. */
    findReferences(input: { readonly nodeTypes: readonly string[] }): Promise<readonly ResourceFlowNode[]>;
  };
  readonly settings: {
    /** Requires READ_SETTINGS. Reading configuration has no write or initialization side effect. */
    findByKey(input: { readonly parent: string; readonly key: string }): Promise<string | null>;
  };
}

/** Tokens are local to the declaring plugin. A token never names a host provider or table. */
export interface PluginOperationToken<TOperations> {
  readonly id: symbol;
  readonly description: string;
  /** Only these reviewed methods cross the adapter boundary; private adapter fields stay internal. */
  readonly methods: readonly PropertyKey[];
  /** Compile-time association; no operations or connection are stored on the token. */
  readonly operations?: TOperations;
}

export function pluginOperationToken<TOperations>(
  description: string,
  methods: readonly (keyof TOperations)[] = [],
): PluginOperationToken<TOperations> {
  return Object.freeze({ id: Symbol(description), description, methods: Object.freeze([...new Set(methods)]) });
}

export interface PluginPersistenceContext {
  /** Requires DATABASE_ACCESS. Resolution is restricted to this plugin's registered adapters. */
  resolve<TOperations>(token: PluginOperationToken<TOperations>): TOperations;
}
