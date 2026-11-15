import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDashboardPinsDto } from './dashboard-pin.dto';

const errorsOf = async (body: unknown) =>
  (await validate(plainToInstance(UpdateDashboardPinsDto, body), { whitelist: true })).map(({ property }) => property);

describe('UpdateDashboardPinsDto', () => {
  it.each([
    { kind: 'add', item: { itemType: 'page', itemId: '/devices/mqtt/servers' } },
    { kind: 'add', item: { itemType: 'resource', itemId: '42' } },
    { kind: 'move', item: { itemType: 'resource', itemId: '42' }, before: { itemType: 'page', itemId: '/projects' } },
  ])('accepts %j', async (body) => {
    expect(await errorsOf(body)).toEqual([]);
  });

  it.each([
    [{ kind: 'replace', item: { itemType: 'page', itemId: '/projects' } }, 'kind'],
    [{ kind: 'add' }, 'item'],
    [{ kind: 'add', item: { itemType: 'group', itemId: '1' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'page', itemId: 'https://example.com' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'page', itemId: '/a/../b' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'page', itemId: '/projects?x=1' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'resource', itemId: '007' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'resource', itemId: '0' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'resource', itemId: '/projects' } }, 'item'],
    [{ kind: 'add', item: { itemType: 'resource', itemId: 7 } }, 'item'],
    [{ kind: 'move', item: { itemType: 'page', itemId: '/a' }, before: { itemType: 'page', itemId: 'x' } }, 'before'],
  ])('rejects %j', async (body, property) => {
    expect(await errorsOf(body)).toContain(property);
  });
});
