import { ResourceFlowNodeType } from '@attraccess/database-entities';
import { OLD_TO_NEW, NEW_TO_OLD } from '../1779436910172-flow-node-domain-first';

describe('FlowNodeDomainFirst migration lookup tables', () => {
  it('OLD_TO_NEW values cover every current ResourceFlowNodeType value', () => {
    const newValues = Object.values(OLD_TO_NEW).sort();
    const enumValues = Object.values(ResourceFlowNodeType).sort();
    expect(newValues).toEqual(enumValues);
  });

  it('NEW_TO_OLD is the inverse of OLD_TO_NEW', () => {
    for (const [oldType, newType] of Object.entries(OLD_TO_NEW)) {
      expect(NEW_TO_OLD[newType]).toBe(oldType);
    }
    expect(Object.keys(NEW_TO_OLD).length).toBe(Object.keys(OLD_TO_NEW).length);
  });
});
