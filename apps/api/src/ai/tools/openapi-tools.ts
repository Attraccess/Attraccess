import { OpenAPIObject } from '@nestjs/swagger';

interface ReferenceObject {
  $ref: string;
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  items?: SchemaObject | ReferenceObject;
  required?: string[];
  enum?: unknown[];
  description?: string;
  format?: string;
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: SchemaObject | ReferenceObject;
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: unknown;
}

export interface EndpointInfo {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters: { name: string; in: string; required: boolean; type: string; description: string }[];
  requestBodySummary: string | null;
}

export class OpenApiEndpointIndex {
  private endpoints: EndpointInfo[] = [];

  constructor(private readonly doc: OpenAPIObject) {
    this.buildIndex();
  }

  private buildIndex() {
    const paths = this.doc.paths || {};

    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (pathStr.includes('/ai/') || pathStr.includes('/ai-')) continue;

      const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)?.[method] as OperationObject | undefined;
        if (!operation) continue;

        const params = this.extractParameters(operation, pathItem);
        const bodySummary = this.extractRequestBodySummary(operation);

        this.endpoints.push({
          method: method.toUpperCase(),
          path: pathStr,
          operationId: operation.operationId || `${method}_${pathStr}`,
          summary: operation.summary || '',
          description: operation.description || '',
          tags: (operation.tags as string[]) || [],
          parameters: params,
          requestBodySummary: bodySummary,
        });
      }
    }
  }

  private extractParameters(
    operation: OperationObject,
    pathItem: unknown,
  ): EndpointInfo['parameters'] {
    const result: EndpointInfo['parameters'] = [];
    const allParams = [
      ...((pathItem as Record<string, unknown>)?.parameters as ParameterObject[] || []),
      ...(operation.parameters as ParameterObject[] || []),
    ];

    for (const param of allParams) {
      const resolved = this.resolveRef(param) as ParameterObject;
      if (!resolved?.name) continue;
      const schema = this.resolveRef(resolved.schema) as SchemaObject | undefined;
      result.push({
        name: resolved.name,
        in: resolved.in,
        required: resolved.required || false,
        type: schema?.type as string || 'string',
        description: resolved.description || schema?.description || '',
      });
    }

    return result;
  }

  private extractRequestBodySummary(operation: OperationObject): string | null {
    const reqBody = (operation as Record<string, unknown>).requestBody;
    if (!reqBody) return null;

    const resolved = this.resolveRef(reqBody) as Record<string, unknown>;
    const content = resolved?.content as Record<string, unknown> | undefined;
    if (!content) return null;

    const jsonContent = content['application/json'] as Record<string, unknown> | undefined;
    if (!jsonContent?.schema) return null;

    const schema = this.resolveRef(jsonContent.schema) as SchemaObject;
    return this.summarizeSchema(schema, 2);
  }

  private summarizeSchema(schema: SchemaObject | undefined, depth: number): string {
    if (!schema || depth <= 0) return '...';

    if (schema.type === 'object' && schema.properties) {
      const props = Object.entries(schema.properties).map(([name, propRef]) => {
        const prop = this.resolveRef(propRef) as SchemaObject;
        const required = (schema.required || []).includes(name);
        const typeStr = prop.type as string || 'unknown';
        const reqStr = required ? ', required' : '';
        const descStr = prop.description ? ` — ${prop.description}` : '';
        return `  ${name}: ${typeStr}${reqStr}${descStr}`;
      });
      return `{\n${props.join('\n')}\n}`;
    }

    if (schema.type === 'array') {
      const items = this.resolveRef(schema.items) as SchemaObject | undefined;
      const itemType = items?.type as string || 'unknown';
      return `${itemType}[]`;
    }

    return (schema.type as string) || 'unknown';
  }

  private resolveRef(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    const refObj = obj as ReferenceObject;
    if (!refObj.$ref) return obj;

    const refPath = refObj.$ref.replace('#/', '').split('/');
    let current: unknown = this.doc;
    for (const segment of refPath) {
      current = (current as Record<string, unknown>)?.[segment];
      if (current === undefined) return {};
    }
    return current;
  }

  search(query: string, maxResults = 10): EndpointInfo[] {
    if (!query) return [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(Boolean);

    const scored = this.endpoints.map((ep) => {
      const searchableText = [
        ep.operationId,
        ep.summary,
        ep.description,
        ep.path,
        ...ep.tags,
      ].join(' ').toLowerCase();

      let score = 0;
      for (const word of queryWords) {
        if (searchableText.includes(word)) score++;
      }

      if (ep.operationId.toLowerCase().includes(queryLower)) score += 3;
      if (ep.summary.toLowerCase().includes(queryLower)) score += 2;
      if (ep.path.toLowerCase().includes(queryLower)) score += 1;

      return { endpoint: ep, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.endpoint);
  }

  getAllEndpoints(): EndpointInfo[] {
    return [...this.endpoints];
  }
}
