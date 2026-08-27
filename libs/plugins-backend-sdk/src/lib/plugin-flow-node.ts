/**
 * Contract for backend plugins to register custom flow node types.
 *
 * Usage:
 *   export default {
 *     register(context) { ... },
 *     flowNodes: [shellyOnNode, shellyOffNode],
 *   } satisfies PluginBackendModule;
 */

/**
 * Minimal execution context passed to a plugin node's execute() function.
 * Mirrors the subset of NodeExecutionContext that is useful to plugins;
 * the host satisfies this interface structurally.
 */
export interface PluginNodeExecutionContext {
  /**
   * Compile a Handlebars template string against the current payload data.
   * Supports the same template variables as built-in node types
   * ({{resource.id}}, {{payload.*}}, etc.).
   */
  compileTemplate(template: string, data: object): string;
}

/**
 * Describes a single custom flow node contributed by a plugin.
 *
 * Node type naming convention: use "plugin.<pluginName>.<nodeName>" to
 * guarantee no collision with core node types, e.g. "plugin.shelly.send-on".
 */
interface PluginFlowNodeDefinitionBase {
  /**
   * Unique type string. Must be stable across plugin versions — it is stored
   * in the database alongside saved flows. Convention: "plugin.<name>.<node>".
   */
  readonly type: string;

  /**
   * Human-readable display name. Used in the frontend node catalog and on the
   * canvas as a fallback when no i18n translation key is found for this type.
   */
  readonly label: string;

  /** Optional description shown in the catalog node preview. */
  readonly description?: string;

  /**
   * JSON Schema object describing the node's configuration fields.
   * The host uses this to render the config form in the frontend editor.
   *
   * Supports the same meta extensions as built-in schemas:
   *   { selectFromEntity: 'mqttServer', entityProperty: 'id' }
   *   { stringVariant: 'multiline' }
   *   { helpText: '...' }
   */
  readonly configSchema?: Record<string, unknown>;

  /**
   * Builds a configuration schema from the values selected so far. The returned
   * schema must set `dynamic: true`; fields that should trigger a refresh set
   * `refreshesSchema: true`.
   */
  resolveConfigSchema?(currentConfig: Record<string, unknown>): Promise<Record<string, unknown>>;

  /** Handle IDs accepted as inputs (e.g. ['input']). Empty for trigger nodes. */
  readonly inputs: readonly string[];

  /** Handle IDs produced as outputs (e.g. ['output']). Empty for terminal nodes. */
  readonly outputs: readonly string[];

  /**
   * Whether the node is available for all resource types.
   * Defaults to true. Set false to hide it from the catalog for all resources.
   */
  readonly supportedByAllResources?: boolean;

  /**
   * Set to true for nodes that terminate a flow branch (no further chaining
   * expected). Controls the direction indicator in the catalog UI.
   */
  readonly isOutput?: boolean;
}

/** A plugin node that starts a flow when the plugin calls context.flows.trigger(). */
export interface PluginFlowTriggerNodeDefinition extends PluginFlowNodeDefinitionBase {
  /** Marks this node as a flow trigger rather than an executable node. */
  readonly isInput: true;

  /** Trigger nodes do not consume a preceding node's output. */
  readonly inputs: readonly [];

  /** Trigger nodes are passthrough nodes, so the host never calls execute(). */
  readonly execute?: never;
}

/** A plugin node executed after a flow has already started. */
export interface PluginFlowExecutionNodeDefinition extends PluginFlowNodeDefinitionBase {
  readonly isInput?: false;

  /**
   * Execute the node. Called by the host flow engine when this node is reached
   * during flow execution.
   *
   * @param node  The persisted node record (id, type, data as saved config).
   * @param input The payload object forwarded from the previous node.
   * @param ctx   Host utilities available during execution.
   * @returns The output payload and, for multi-output nodes, the chosen handle.
   */
  execute(
    node: { id: string; type: string; data: Record<string, unknown> },
    input: object,
    ctx: PluginNodeExecutionContext,
  ): Promise<{ payload: object; outputHandle?: string }>;
}

export type PluginFlowNodeDefinition = PluginFlowTriggerNodeDefinition | PluginFlowExecutionNodeDefinition;
