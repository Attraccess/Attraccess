import { describe, expect, it } from 'vitest';
import type { ResourceFlowNodeSchemaDto } from '@attraccess/react-query-client';
import { findUnsupportedNodeTypes, flowOwnerKey, flowScopeOf, schemaSupportsOwner, type FlowOwner } from './flowOwner';

const resource: FlowOwner = { kind: 'resource', resourceId: 4 };
const global: FlowOwner = { kind: 'global', flowId: 4 };
const schema = (supportedByResource: boolean, scopes: Array<'resource' | 'global'>) =>
  ({ type: 'x', supportedByResource, supportedFlowScopes: scopes }) as unknown as ResourceFlowNodeSchemaDto;

describe('flow owner', () => {
  it('derives scope and a distinct identity per owner kind', () => {
    expect(flowScopeOf(resource)).toBe('resource');
    expect(flowScopeOf(global)).toBe('global');
    expect(flowOwnerKey(resource)).not.toBe(flowOwnerKey(global));
  });

  it('filters schemas by scope, applying supportedByResource to resource flows only', () => {
    expect(schemaSupportsOwner(schema(true, ['resource']), resource)).toBe(true);
    expect(schemaSupportsOwner(schema(true, ['resource']), global)).toBe(false);
    expect(schemaSupportsOwner(schema(true, ['global']), resource)).toBe(false);
    expect(schemaSupportsOwner(schema(false, ['resource', 'global']), resource)).toBe(false);
    expect(schemaSupportsOwner(schema(false, ['resource', 'global']), global)).toBe(true);
  });

  it('finds imported nodes the owner cannot hold, using the catalogue rules', () => {
    const schemas = [
      { ...schema(true, ['resource']), type: 'resource-only' },
      { ...schema(false, ['resource', 'global']), type: 'not-for-this-resource' },
      { ...schema(true, ['resource', 'global']), type: 'both' },
    ] as ResourceFlowNodeSchemaDto[];
    const nodes = [{ type: 'resource-only' }, { type: 'not-for-this-resource' }, { type: 'both' }, { type: 'unknown' }];

    expect(findUnsupportedNodeTypes(nodes, schemas, resource)).toEqual(['not-for-this-resource', 'unknown']);
    expect(findUnsupportedNodeTypes(nodes, schemas, global)).toEqual(['resource-only', 'unknown']);
  });
});
