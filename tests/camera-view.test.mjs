import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCameraView } from '../src/viewer/camera-view.js';
test('reproducible camera rejects invalid axes and keeps finite view geometry', () => {
  const input={target:[1,2,3],direction:[0,0,3],up:[0,2,0],radius:20};
  assert.deepEqual(validateCameraView(input).direction,[0,0,1]);
  assert.throws(()=>validateCameraView({...input,up:[0,0,1]}),/nonparallel/);
  assert.throws(()=>validateCameraView({...input,radius:NaN}),/radius/);
});
