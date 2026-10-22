import { measure } from './measurement';

describe('measured software envelope with real broker and production processing', () => {
  it('repeats the highest passing stage and records failures rather than claiming hardware capacity', async () => {
    await measure(JSON.parse(process.env.WAGO_ASSURANCE_OPTIONS ?? '{}'), process.env.WAGO_ASSURANCE_OUTPUT ?? '');
  });
});
