import assert from 'node:assert/strict';
import test from 'node:test';

import { npmDistTag } from './npm-dist-tag.mjs';

test('derives npm dist-tags from package versions', () => {
  assert.equal(npmDistTag('0.1.0-alpha.0'), 'alpha');
  assert.equal(npmDistTag('0.1.0-beta.0'), 'beta');
  assert.equal(npmDistTag('1.0.0-0'), 'next');
  assert.equal(npmDistTag('0.1.0'), 'latest');
});
