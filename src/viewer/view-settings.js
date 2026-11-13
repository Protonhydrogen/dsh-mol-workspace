import {Canvas3DParams,CameraFogParams} from 'molstar/lib/mol-canvas3d/canvas3d';
import {failure} from '../shared/model.js';
export const CLIPPING_PARAMS=Canvas3DParams.cameraClipping.params;
// Mol* maps the control to radius = sceneRadius * (100 - value) / 100.
// Zero therefore shows the whole scene; 100 produces a zero radius which Mol* ignores.
export const DEFAULT_CLIPPING={radius:0,far:CLIPPING_PARAMS.far.defaultValue,minNear:CLIPPING_PARAMS.minNear.defaultValue,fog:CameraFogParams.intensity.defaultValue};
export function clippingProps(input={}){
 const value={...DEFAULT_CLIPPING,...input};
 for(const name of ['radius','minNear']){
  const p=CLIPPING_PARAMS[name],max=Math.max(p.max,p.defaultValue);
  if(!Number.isFinite(value[name])||value[name]<p.min||value[name]>max)throw failure('INVALID_ARGUMENT',`${name} must be ${p.min}–${max}`);
 }
 if(typeof value.far!=='boolean'||!Number.isFinite(value.fog)||value.fog<0||value.fog>100)throw failure('INVALID_ARGUMENT','far must be boolean and fog must be 0–100');
 return {cameraClipping:{radius:value.radius,far:value.far,minNear:value.minNear},cameraFog:value.fog?{name:'on',params:{intensity:value.fog}}:{name:'off',params:{}}};
}
export function applyClipping(e,value){const canvas=e.plugin.canvas3d;canvas.commit(true);canvas.camera.transition.finish(canvas.camera.transition.target);canvas.setProps(clippingProps(value));canvas.camera.transition.finish(canvas.camera.transition.target);canvas.requestDraw();e.appliedClipping=JSON.stringify(value);}
