import { PluginStorageInvalid } from './plugin-storage';
import type { OpenSide } from './plugin-storage-contract-fixture.test-cases';

const UUID = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

/** Field values: what is stored, what reads back, what is refused. */
export function describeStorageContractValues(open: OpenSide): void {
  describe('values', () => {
    it('round-trips every field type exactly and fills defaults and generated keys', async () => {
      const { items } = await open();
      const due = '2026-02-28';
      const created = new Date('2026-11-17T10:20:30.456Z');
      const meta = { nested: { list: [1, 'two', null, true] }, text: 'ü "quoted" \'single\'' };
      const inserted = await items.insert({ name: 'values', price: '1234567.89', due, meta, ref: UUID, created });
      expect(inserted).toEqual({
        id: expect.any(Number),
        name: 'values',
        qty: 0,
        score: null,
        price: '1234567.89',
        active: true,
        created,
        due,
        meta,
        ref: UUID.toLowerCase(),
        status: 'new',
        note: null,
      });
      expect(await items.get(inserted.id)).toEqual(inserted);
      const second = await items.insert({ name: 'values-2' });
      expect(second.id).toBeGreaterThan(inserted.id);
      expect(second.created).toBeInstanceOf(Date);
      expect(Math.abs(second.created.getTime() - Date.now())).toBeLessThan(60_000);
    });

    it('keeps decimals exact: no rounding, trailing zeros, sums without float drift', async () => {
      const { items } = await open();
      await items.insert({ name: 'dec-a', price: '0.10', status: 'dec' });
      await items.insert({ name: 'dec-b', price: '0.20', status: 'dec' });
      await items.insert({ name: 'dec-c', price: '-5.5', status: 'dec' });
      expect((await items.findOne({ where: { name: 'dec-c' } })).price).toBe('-5.50');
      expect(await items.aggregate('price', { status: 'dec' })).toEqual({
        sum: '-5.20',
        min: '-5.50',
        max: '0.20',
        count: 3,
      });
      expect(await items.aggregate('price', { status: 'no-such-status' })).toEqual({
        sum: null,
        min: null,
        max: null,
        count: 0,
      });
      for (const price of ['1.005', '123456789.00', 1.5, '1e3', '12,5']) {
        await expect(items.insert({ name: `dec-${String(price)}`, price })).rejects.toBeInstanceOf(
          PluginStorageInvalid,
        );
      }
    });

    it('stores timestamps as UTC instants with millisecond precision', async () => {
      const { items } = await open();
      const instant = new Date('1999-12-31T23:59:59.001Z');
      const row = await items.insert({ name: 'ts', created: instant });
      expect((await items.get(row.id)).created.getTime()).toBe(instant.getTime());
      const window = [new Date('1999-12-31T23:59:59.000Z'), new Date('2000-01-01T00:00:00Z')];
      expect(await items.count({ created: { between: window } })).toBe(1);
      await expect(items.insert({ name: 'ts-bad', created: new Date('nope') })).rejects.toBeInstanceOf(
        PluginStorageInvalid,
      );
    });

    it('keeps text exactly: quotes, accents, emoji and long text', async () => {
      const { items } = await open();
      const name = `quote ' " \\ ü 😀 𝄞`;
      const note = 'x'.repeat(5000) + '😀';
      const row = await items.insert({ name, note });
      expect(await items.get(row.id)).toMatchObject({ name, note });
      expect(await items.count({ name })).toBe(1);
    });

    it('rejects values a field cannot hold', async () => {
      const { items } = await open();
      const reject = (row: object) => expect(items.insert(row)).rejects.toBeInstanceOf(PluginStorageInvalid);
      await reject({});
      await reject({ name: 'x'.repeat(41) });
      await reject({ name: 'n1', qty: 1.5 });
      await reject({ name: 'n2', qty: Number.MAX_SAFE_INTEGER + 1 });
      await reject({ name: 'n3', active: 'yes' });
      await reject({ name: 'n4', due: '2026-02-30' });
      await reject({ name: 'n5', ref: 'not-a-uuid' });
      await reject({ name: 'n6', meta: { bad: Number.NaN } });
      await reject({ name: 'n7', meta: { fn: () => 1 } });
      await reject({ name: 'n8', meta: { when: new Date() } });
      await reject({ name: 'n9', unknownField: 1 });
      await reject({ name: 'n10', toString: 'x' });
      await reject({ name: null });
      await expect(items.insertMany('nope')).rejects.toBeInstanceOf(PluginStorageInvalid);
    });

    it('never lets a value act as SQL', async () => {
      const { items } = await open();
      const hostile = `x'); DROP TABLE items; --`;
      const row = await items.insert({ name: hostile, status: hostile.slice(0, 20) });
      expect((await items.get(row.id)).name).toBe(hostile);
      expect(await items.count({ status: hostile.slice(0, 20) })).toBe(1);
      expect(await items.count({ name: { startsWith: "x'); DROP" } })).toBe(1);
    });
  });
}
