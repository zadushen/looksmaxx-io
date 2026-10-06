import test from 'node:test';
import assert from 'node:assert/strict';
import { serverLimits } from '../server-config.js';

test('deployment limits are configurable and unsafe settings fail at startup',()=>{
  assert.deepEqual(serverLimits({}),{publicPlayers:64,connections:128,rooms:32});
  assert.deepEqual(serverLimits({PUBLIC_LIMIT:'8',CONNECTION_LIMIT:'24',MAX_ROOMS:'4'}),{publicPlayers:8,connections:24,rooms:4});
  for(const value of ['0','-1','1.5','NaN','65',''])assert.throws(()=>serverLimits({PUBLIC_LIMIT:value}),/PUBLIC_LIMIT/);
});
