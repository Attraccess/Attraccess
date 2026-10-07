import { ResourceFlowNode, ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { registerFlowDefinedEnergyMeteringFixture } from './resource-metering.persistence.flow-defined-energy-metering.test-fixture';
export function registerOperationsCases(fixture: ReturnType<typeof registerFlowDefinedEnergyMeteringFixture>) {
  describe('operations', () => {
    async function activeSession() {
      await fixture.seedMeter();
      const started = await fixture.usage.startSession(1, fixture.users[0], {} as never);
      return fixture.source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: started.id });
    }
    const run = (session: ResourceMeteringSession, kind: 'interim' | 'final' = 'interim', timeoutSeconds = 5) =>
      fixture.metering['runOperation'](session, kind, {
        trigger: fixture.T.INPUT_METERING_COLLECT,
        timeoutSeconds,
        ...(kind === 'final' ? { freshAfter: new Date(Date.now() - 1000) } : {}),
      });

    it('converts every supported energy unit centrally', async () => {
      const session = await activeSession();
      for (const [value, unit] of [
        ['1500', 'Wh'],
        ['5400', 'kJ'],
        ['0.0015', 'MWh'],
        ['1500000', 'milliwatt-hour'],
      ]) {
        fixture.onCollect = fixture.reading(value, unit);
        expect((await run(session)).totalMicroWh).toBe('1500000000');
        await fixture.source.getRepository(ResourceMeteringSession).update(session.id, { latestMicroWh: null });
      }
    });

    it('rejects a reply that arrives after the operation timed out', async () => {
      const session = await activeSession();
      let lateReply: Promise<void> | undefined;
      fixture.onCollect = ({ complete }) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            lateReply = complete({ kind: 'reading', value: '9', unit: 'kWh' });
            lateReply.then(resolve, resolve);
          }, 1300);
        });
      await expect(run(session, 'interim', 1)).rejects.toThrow(/did not reply within 1s/);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await expect(lateReply).rejects.toThrow(/already answered or has expired/);
      const operation = await fixture.source
        .getRepository(ResourceMeteringOperation)
        .findOneByOrFail({ kind: 'interim' });
      expect(operation).toEqual(expect.objectContaining({ status: 'expired', totalMicroWh: null }));
      expect(
        (await fixture.source.getRepository(ResourceMeteringSession).findOneByOrFail({ id: session.id })).latestMicroWh,
      ).toBeNull();
    }, 10_000);

    it('accepts an identical duplicate reply and rejects a conflicting one', async () => {
      const session = await activeSession();
      fixture.onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1', unit: 'kWh' });
        await complete({ kind: 'reading', value: '1000', unit: 'Wh' });
      };
      expect((await run(session)).totalMicroWh).toBe('1000000000');

      fixture.onCollect = async ({ complete }) => {
        await complete({ kind: 'reading', value: '1.2', unit: 'kWh' });
        await complete({ kind: 'reading', value: '1.3', unit: 'kWh' });
      };
      await expect(run(session)).rejects.toThrow(/already answered/);
    });

    it('rejects a reply of the wrong kind and a completion outside a metering run', async () => {
      const session = await activeSession();
      fixture.onCollect = ({ complete }) => complete({ kind: 'ready' });
      await expect(run(session)).rejects.toThrow(/does not answer/);

      const { MeteringReportExecutor } = await import('../flows/node-executors');
      await expect(
        new MeteringReportExecutor().execute({ data: { value: '1', unit: 'kWh' } } as never, {}, {
          compileTemplate: (t: string) => t,
        } as never),
      ).rejects.toThrow(/Metering collection/);
    });

    it('fails an operation whose branch ends without reporting', async () => {
      const session = await activeSession();
      fixture.onCollect = async () => undefined;
      await expect(run(session)).rejects.toThrow(/finished without reporting/);
      expect(
        await fixture.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' }),
      ).toEqual(expect.objectContaining({ status: 'failed' }));
    });

    it('serializes concurrent requests for one resource so replies cannot cross', async () => {
      const session = await activeSession();
      let running = 0;
      let peak = 0;
      fixture.onCollect = async ({ complete, kind }) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 30));
        await complete({ kind: 'reading', value: kind === 'final' ? '2' : '1', unit: 'kWh' });
        running--;
      };
      const [interim, final] = await Promise.all([run(session, 'interim'), run(session, 'final')]);
      expect(peak).toBe(1);
      expect([interim.totalMicroWh, final.totalMicroWh]).toEqual(['1000000000', '2000000000']);
    });

    it('marks operations interrupted by a restart as expired', async () => {
      const session = await activeSession();
      await fixture.source.getRepository(ResourceMeteringOperation).save({
        id: 'stuck',
        sessionId: session.id,
        resourceId: 1,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      await fixture.metering.onModuleInit();
      expect(await fixture.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ id: 'stuck' })).toEqual(
        expect.objectContaining({ status: 'expired' }),
      );
    });

    it("exposes the running session's live total and its exactly rounded energy cost", async () => {
      const session = await activeSession();
      expect((await fixture.metering.getLive(1)).session).toEqual(
        expect.objectContaining({ latestKwh: null, energyCredits: null, creditsPerKwh: 30 }),
      );
      fixture.onCollect = fixture.reading('0.05');
      await run(session);
      expect((await fixture.metering.getLive(1)).session).toEqual(
        expect.objectContaining({ sessionId: session.id, latestKwh: '0.05', energyCredits: 2, creditsPerKwh: 30 }),
      );
      await fixture.usage.endSession(1, fixture.users[0], {} as never);
      expect((await fixture.metering.getLive(1)).session).toBeNull();
    });

    it('records interim readings for display only and skips busy or disabled meters', async () => {
      const session = await activeSession();
      await fixture.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      fixture.onCollect = fixture.reading('0.7');
      await fixture.metering.collectInterimReadings();
      expect((await fixture.metering.getStatus(1)).activeSession).toEqual(
        expect.objectContaining({ latestKwh: '0.7' }),
      );

      await fixture.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { latestObservedAt: new Date(Date.now() - 3_600_000) });
      await fixture.source
        .getRepository(ResourceFlowNode)
        .update({ id: 'collect' }, { data: { interimIntervalMinutes: 0 } });
      fixture.onCollect = fixture.reading('0.9');
      await fixture.metering.collectInterimReadings();
      expect((await fixture.metering.getStatus(1)).activeSession).toEqual(
        expect.objectContaining({ latestKwh: '0.7' }),
      );
    });

    it('does not poll a meter that keeps failing more often than its interval', async () => {
      const session = await activeSession();
      await fixture.source
        .getRepository(ResourceMeteringSession)
        .update(session.id, { createdAt: new Date(Date.now() - 3_600_000) });
      const collect = jest.fn().mockRejectedValue(new Error('meter unreachable'));
      fixture.onCollect = collect;
      await fixture.metering.collectInterimReadings();
      await fixture.metering.collectInterimReadings();
      expect(collect).toHaveBeenCalledTimes(1);
    });
  });
}
