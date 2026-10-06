import test from 'node:test';
import assert from 'node:assert/strict';
import { Progress } from '../src/progress.js';

const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };

test('local progress unlocks achievements and persists selected skins', () => {
  const storage = memoryStorage(), progress = new Progress(storage);
  assert.equal(progress.selectSkin('mint'), false);
  const unlocked = progress.recordGame({ mass: 55, tier: 'high-tier normie' });
  assert.equal(unlocked.length, 3);
  assert.equal(progress.selectSkin('mint'), true);
  assert.equal(new Progress(storage).skin().id, 'mint');
});
