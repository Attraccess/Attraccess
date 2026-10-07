import { randomBytes } from 'crypto';
import { LegacyWebhookFlowConversionImplementation } from './legacy-webhook-flow-conversion';
export abstract class LegacyFlowTemplateConversionImplementation extends LegacyWebhookFlowConversionImplementation {
  protected generateNodeId(): string {
    return randomBytes(16).toString('base64url').slice(0, 21); // Same format as used in the flow system
  }

  protected generateEdgeId(): string {
    return randomBytes(16).toString('base64url').slice(0, 21);
  }

  /**
   * Transform IoT templates to flow templates.
   * IoT templates use direct variables like {{name}}, {{user.username}}
   * Flow templates wrap everything under {{input.*}}
   */
  protected transformTemplate(template: string): string {
    if (!template) return template;

    // Template variable mapping from IoT to Flow format
    const templateMappings = [
      // Resource properties
      { from: /\{\{id\}\}/g, to: '{{input.resource.id}}' },
      { from: /\{\{name\}\}/g, to: '{{input.resource.name}}' },

      // Event properties
      { from: /\{\{timestamp\}\}/g, to: '{{input.event.timestamp}}' },

      // User properties
      { from: /\{\{user\.id\}\}/g, to: '{{input.user.id}}' },
      { from: /\{\{user\.username\}\}/g, to: '{{input.user.username}}' },
      { from: /\{\{user\.externalIdentifier\}\}/g, to: '{{input.user.externalIdentifier}}' },

      // Previous user properties (for takeover events)
      { from: /\{\{previousUser\.id\}\}/g, to: '{{input.previousUser.id}}' },
      { from: /\{\{previousUser\.username\}\}/g, to: '{{input.previousUser.username}}' },
      { from: /\{\{previousUser\.externalIdentifier\}\}/g, to: '{{input.previousUser.externalIdentifier}}' },

      // Legacy user property variations (some templates might use different formats)
      { from: /\{\{user\.name\}\}/g, to: '{{input.user.username}}' },
      { from: /\{\{previousUser\.name\}\}/g, to: '{{input.previousUser.username}}' },
    ];

    let transformedTemplate = template;

    // Apply all transformations
    for (const mapping of templateMappings) {
      transformedTemplate = transformedTemplate.replace(mapping.from, mapping.to);
    }

    return transformedTemplate;
  }

  /**
   * Transform template variables in webhook headers object
   */
  protected transformWebhookHeaders(headers: Record<string, string>): Record<string, string> {
    const transformedHeaders: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      transformedHeaders[key] = this.transformTemplate(value);
    }

    return transformedHeaders;
  }
}
