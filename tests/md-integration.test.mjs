import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {MolEngine} from '../src/viewer/engine.js';
import {WorkspaceState} from '../src/host/workspace-state.js';
import {MolecularContextService} from '../src/host/service-v3.js';
import {readTrajectoryFile} from '../src/host/trajectory-file.js';
import {OUT_DIR} from './paths.mjs';
function mockEngine(){
 const e=new MolEngine(),deleted=[];const update={delete(ref){deleted.push(ref);return this;},async commit(){}};
 e.plugin={state:{data:{cells:new Map(),build:()=>update}},managers:{interactivity:{lociSelects:{deselectAll(){}}}}};
 e.structureNode=()=>undefined;e.setActiveStructure=()=>{};e.setTheme=()=>{};e.appliedSelection=null;
 return {e,deleted};
}
const scene=structures=>({structures,selection:null,layers:[],tags:[],measurements:[],hiddenSelections:[],camera:{},trajectory:{}});
test('unavailable saved MD source warns once without blocking recovery commands',async()=>{
 const {e}=mockEngine();e.structures.set('1',{});e.displayCache.set('1',{});let reads=0,warnings=0;
 e.readTrajectoryData=async()=>{reads++;throw Error('file missing');};e.onError=()=>warnings++;
 const state=scene([{structureId:'1',display:{},mdTrajectory:{path:'missing.dcd',sha256:'original'}}]);
 await e.sync(state);await e.sync(state);assert.equal(reads,1);assert.equal(warnings,1);assert.ok(e.structures.has('1'));
 state.structures[0].mdTrajectory.sha256='replacement';await e.sync(state);assert.equal(reads,2);
 const result=await e.execute({action:'clearMeasurements',args:{}},state);
 assert.deepEqual(result.value.removed,[]);
});
test('removing an MD structure pauses playback and deletes binary, coordinates and retained topology roots',async()=>{
 const {e,deleted}=mockEngine();let paused=0;e.playback={pause:async()=>paused++};e.playingStructureId='1';
 e.structures.set('1',{});e.trajectories.set('1',{md:true,ref:'trajectory',rawRef:'binary',baseModelRef:'topology'});
 await e.sync(scene([]));assert.equal(paused,1);assert.deepEqual(deleted,['trajectory','binary','topology']);assert.equal(e.trajectories.size,0);assert.equal(e.structures.size,0);
});
test('trajectory attachment invalidates pre-MD scene undo records',()=>{
 const s=new WorkspaceState();s.heartbeat('viewer');s.addStructure({title:'topology'},'data');
 let c=s.enqueue({action:'setDisplay'});s.claim('viewer',c.id);s.complete('viewer',{id:c.id,ok:true,patch:{tags:[{id:'old'}]}});assert.ok(s.snapshot().undo);
 c=s.enqueue({action:'loadTrajectory',args:{structureId:'1'}});s.claim('viewer',c.id);s.complete('viewer',{id:c.id,ok:true,patch:{tags:[]}});assert.equal(s.snapshot().undo,null);
});
test('host MD reads require an authorized source and detect changed restored coordinates',async()=>{
 const dir=join(OUT_DIR,'host-md-check');await mkdir(dir,{recursive:true});const path=join(dir,'bounded.dcd');
 await writeFile(path,Buffer.from('explicitly synthetic host read fixture'));
 try{
  const payload=await readTrajectoryFile(path,dir);assert.equal(payload.format,'dcd');assert.equal(Buffer.from(payload.data,'base64').length,payload.byteLength);
  const service=Object.create(MolecularContextService.prototype),state={structures:new Map([['1',{ref:{mdTrajectory:{path,sha256:payload.sha256}}}]]),commands:new Map()};
  service._state=()=>state;service._cwd=()=>dir;
  assert.equal((await service.getTrajectoryData('s','1',path)).sha256,payload.sha256);
  await assert.rejects(service.getTrajectoryData('s','1',join(dir,'unrequested.dcd')),e=>e.code==='TARGET_NOT_FOUND');
  await writeFile(path,'changed');
  await assert.rejects(service.getTrajectoryData('s','1',path),e=>e.code==='VERSION_CONFLICT');
  state.commands.set('attach',{action:'loadTrajectory',status:'running',args:{structureId:'1',path}});
  assert.notEqual((await service.getTrajectoryData('s','1',path)).sha256,payload.sha256);
 }finally{await rm(path);}
});

test('actual removeStructure command shares MD cleanup before subsequent state synchronization',async()=>{
 const {e,deleted}=mockEngine();let paused=0;e.playback={pause:async()=>paused++};e.playingStructureId='1';
 e.structures.set('1',{});e.sources.set('1',{rawRef:'topology-source'});e.models.set('1','md-model');
 e.trajectories.set('1',{md:true,ref:'md-trajectory',rawRef:'md-binary',baseModelRef:'topology-model'});
 const before=scene([{structureId:'1'}]);before.trajectory={structureId:'1',playing:true};
 const result=await e.execute({action:'removeStructure',args:{structureId:'1'}},before);
 assert.equal(paused,1);assert.deepEqual(deleted,['md-trajectory','md-binary','topology-source']);
 assert.equal(e.trajectories.size,0);assert.equal(e.models.size,0);assert.equal(e.sources.size,0);
 assert.deepEqual(result.patch.trajectory,{});await e.sync(scene([]));assert.equal(paused,1);
});
test('unsupported visibility kinds and camera targets fail before changing a different part of the scene',async()=>{
 const {e}=mockEngine();let touched=0;e.structureNode=()=>{touched++;return undefined;};e.focus=async()=>{touched++;};
 await assert.rejects(e.execute({action:'setVisibility',args:{kind:'component',id:'focus-surroundings',visible:false}},scene([])),err=>err.code==='INVALID_ARGUMENT'&&/clearSelection/.test(err.message));
 await assert.rejects(e.execute({action:'camera',args:{mode:'focus',target:[1,2,3]}},scene([])),err=>err.code==='INVALID_ARGUMENT'&&/mode=view/.test(err.message));
 assert.equal(touched,0);
});