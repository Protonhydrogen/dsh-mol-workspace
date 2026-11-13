import test from 'node:test';
import assert from 'node:assert/strict';
import {Canvas3DParams} from 'molstar/lib/mol-canvas3d/canvas3d';
import {clippingProps,DEFAULT_CLIPPING} from '../src/viewer/view-settings.js';
import {executeOperation} from '../src/viewer/operations.js';
test('clipping uses official Molstar parameters, with zero clipping for a full overview',()=>{
 assert.equal(DEFAULT_CLIPPING.radius,0);
 assert.equal(DEFAULT_CLIPPING.minNear,Canvas3DParams.cameraClipping.params.minNear.defaultValue);
 assert.deepEqual(clippingProps({radius:55,far:false,minNear:.5,fog:0}),{cameraClipping:{radius:55,far:false,minNear:.5},cameraFog:{name:'off',params:{}}});
 assert.throws(()=>clippingProps({radius:101}));assert.throws(()=>clippingProps({minNear:0}));
});
test('clearing the target removes focus and resets the camera to overview',async()=>{let reset=0;const result=await executeOperation({overview:async()=>reset++},{action:'clearSelection'},{camera:{}});assert.equal(reset,1);assert.equal(result.patch.selection,null);assert.equal(result.patch.focus,null);assert.equal(result.patch.highlight,null);assert.deepEqual(result.patch.camera.clipping,DEFAULT_CLIPPING);});
