import test from 'node:test';
import assert from 'node:assert/strict';
import { measurementGeometry } from '../src/viewer/measurements.js';
test('distance and angle use ordered coordinates with physical units',()=>{
  assert.deepEqual(measurementGeometry('distance',[[0,0,0],[3,4,0]]),{value:5,unit:'Å'});
  assert.ok(Math.abs(measurementGeometry('angle',[[1,0,0],[0,0,0],[0,1,0]]).value-90)<1e-10);
});
test('torsions are finite and preserve four point order',()=>{
  const a=measurementGeometry('dihedral',[[0,0,0],[1,0,0],[1,1,0],[1,1,1]]);
  assert.ok(Math.abs(Math.abs(a.value)-90)<1e-10);assert.equal(a.unit,'°');
});
test('a plane reports the actual best-fit normal and residual',()=>{
  const p=measurementGeometry('plane',[[0,0,2],[1,0,2],[0,1,2],[1,1,2]]);
  assert.ok(Math.abs(p.geometry.origin[2]-2)<1e-6);assert.ok(Math.abs(Math.abs(p.geometry.normal[2])-1)<1e-6);assert.ok(p.geometry.rms<1e-6);
});
test('missing, nonfinite and degenerate positions fail instead of showing zero',()=>{
  for(const [type,pts] of [['angle',[[0,0,0],[0,0,0],[1,1,0]]],['distance',[[0,0,0],[NaN,0,0]]],['plane',[[0,0,0],[1,0,0],[2,0,0]]],['dihedral',[[0,0,0],[1,0,0]]]])assert.throws(()=>measurementGeometry(type,pts),e=>e.code==='INVALID_ARGUMENT');
});
