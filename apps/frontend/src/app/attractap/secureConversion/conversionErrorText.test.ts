import { conversionErrorText } from './conversionErrorText';

const t = (key: string) => `[${key}]`;
const apiError = (body: unknown) => Object.assign(new Error('Conflict'), { body });

describe('conversionErrorText', () => {
  it('names each refused gate in the UI language, not as a raw code', () => {
    const error = apiError({ message: 'This reader cannot be secured now: reader-offline', blockers: ['reader-offline'] });
    expect(conversionErrorText(error, t)).toBe('[blocker.reader-offline]');
  });

  it('falls back to the server message without blocker codes', () => {
    expect(conversionErrorText(apiError({ message: 'This conversion cannot be retried' }), t)).toBe(
      'This conversion cannot be retried',
    );
  });
});
