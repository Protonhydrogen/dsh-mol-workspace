import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceState } from '../src/host/workspace-state.js';
const connected = () => { const s = new WorkspaceState(); s.heartbeat('viewer-a'); return s; };
test('visual writes fail honestly when no viewer is connected', () => {
  assert.throws(() => new WorkspaceState().enqueue({action:'setDisplay',args:{structureId:'1',color:'uniform'}}), e => e.code === 'VIEWER_NOT_CONNECTED');
});
test('a render command only succeeds after its owner acknowledges it', async () => {
  const s=connected(); const c=s.enqueue({id:'once',action:'setDisplay',args:{structureId:'1',color:'uniform'}});
  const done=s.wait(c.id); assert.equal(s.getCommand(c.id).status,'pending');
  assert.equal(s.claim('viewer-a',c.id).status,'running');
  s.complete('viewer-a',{id:c.id,ok:true,value:{color:'uniform'},patch:{camera:{mode:'orthographic'}}});
  assert.deepEqual(await done,{color:'uniform'}); assert.equal(s.snapshot().camera.mode,'orthographic');
});
test('duplicate command IDs never create two commands and cannot change payloads',()=>{
  const s=connected(); const input={id:'once',action:'camera',args:{mode:'reset'}};
  s.enqueue(input);s.enqueue(input);assert.equal(s.snapshot().commands.length,1);
  assert.throws(()=>s.enqueue({...input,args:{mode:'spin'}}),e=>e.code==='INVALID_ARGUMENT');
});
test('a second renderer cannot claim or acknowledge another renderer command',()=>{
  const s=connected();s.heartbeat('viewer-b');const c=s.enqueue({action:'camera',args:{mode:'reset'}});
  assert.equal(s.claim('viewer-b',c.id),null);s.claim('viewer-a',c.id);
  assert.throws(()=>s.complete('viewer-b',{id:c.id,ok:true,value:{}}),e=>e.code==='INVALID_ARGUMENT');
});
test('expired renderers do not authorize new visual commands',()=>{
  let now=100;const s=new WorkspaceState({now:()=>now,leaseMs:1000});s.heartbeat('viewer-a');now=1200;
  assert.throws(()=>s.enqueue({action:'camera',args:{mode:'reset'}}),e=>e.code==='VIEWER_NOT_CONNECTED');
});
test('stale revisions are rejected before changing state',()=>{
  const s=connected();const revision=s.snapshot().revision;s.setSelection({structureId:'1',kind:'none'});
  assert.throws(()=>s.enqueue({action:'camera',args:{mode:'reset'},expectedRevision:revision}),e=>e.code==='VERSION_CONFLICT');
});
test('renderer errors propagate to the waiting caller and do not commit patches',async()=>{
  const s=connected();const c=s.enqueue({action:'camera',args:{mode:'reset'}});const done=s.wait(c.id);s.claim('viewer-a',c.id);
  s.complete('viewer-a',{id:c.id,ok:false,error:{code:'TARGET_NOT_FOUND',message:'missing atom'},patch:{camera:{wrong:true}}});
  await assert.rejects(done,e=>e.code==='TARGET_NOT_FOUND');assert.equal(s.snapshot().camera.wrong,undefined);
});
test('unacknowledged commands time out rather than returning success',async()=>{
  const s=new WorkspaceState({timeoutMs:15});s.heartbeat('viewer-a');const c=s.enqueue({action:'camera',args:{mode:'reset'}});
  await assert.rejects(s.wait(c.id),e=>e.code==='TIMED_OUT');assert.equal(s.getCommand(c.id).status,'timed_out');
});
test('restoring state retains structures and tags but never replays pending work',()=>{
  const s=connected();s.addStructure({structureId:'1',title:'a.pdb',format:'pdb'},'ATOM');
  s.patch({tags:[{id:'tag-1',name:'site',color:'#8b5cf6',selection:{structureId:'1',kind:'residue',residues:[]}}]});
  const c=s.enqueue({action:'camera',args:{mode:'reset'}});const restored=WorkspaceState.restore(s.serialize());
  assert.equal(restored.snapshot().structures[0].title,'a.pdb');assert.equal(restored.snapshot().tags.length,1);
  assert.equal(restored.getStructureData('1').data,'ATOM');assert.equal(restored.getCommand(c.id).status,'failed');assert.equal(restored.snapshot().viewer.connected,false);
});
test('snapshot consumers cannot mutate authoritative state or input selections',()=>{
  const s=connected();s.addStructure({structureId:'1',title:'a.pdb',format:'pdb'},'ATOM');const sel={structureId:'1',kind:'atom',atoms:[{modelId:1,authAsymId:'A',authSeqId:2,authAtomId:'CA',unitId:0,altId:''}]};
  s.setSelection(sel);sel.atoms[0].authSeqId=99;const snap=s.snapshot();snap.structures[0].title='wrong';
  assert.equal(s.snapshot().structures[0].title,'a.pdb');assert.equal(s.snapshot().selection.atoms[0].authSeqId,2);
});
test('cancellation is terminal and a late acknowledgement cannot commit a write',async()=>{
  const s=connected();const c=s.enqueue({action:'camera',args:{mode:'reset'}});s.claim('viewer-a',c.id);const ac=new AbortController();const done=s.wait(c.id,ac.signal);ac.abort();
  await assert.rejects(done,e=>e.code==='CANCELLED');s.complete('viewer-a',{id:c.id,ok:true,patch:{camera:{wrong:true}}});assert.equal(s.snapshot().camera.wrong,undefined);
});
test('switching renderer ownership terminates work assigned to the old page',()=>{let now=1;const s=new WorkspaceState({now:()=>now,leaseMs:10});s.heartbeat('old');const c=s.enqueue({action:'camera'});now=20;s.heartbeat('new');assert.equal(s.getCommand(c.id).status,'failed');});
test('unwaited commands also expire and a late result cannot patch state',()=>{let now=1;const s=new WorkspaceState({now:()=>now,timeoutMs:10});s.heartbeat('page');const c=s.enqueue({action:'camera'});s.claim('page',c.id);now=20;assert.equal(s.snapshot().commands[0].status,'timed_out');s.complete('page',{id:c.id,ok:true,patch:{activeStructureId:'fake'}});assert.equal(s.activeStructureId,null);});
test('idempotency survives bounded command history and a persisted restore',()=>{const s=connected();for(let i=0;i<34;i++){const c=s.enqueue({id:'old-'+i,action:'camera',args:{mode:'reset'}});s.claim('viewer-a',c.id);s.complete('viewer-a',{id:c.id,ok:true,value:{original:i}});}const duplicate=s.enqueue({id:'old-0',action:'camera',args:{mode:'reset'}});assert.equal(duplicate.status,'succeeded');assert.equal(duplicate.result.original,0);const restored=WorkspaceState.restore(s.serialize());restored.heartbeat('new');assert.equal(restored.enqueue({id:'old-0',action:'camera',args:{mode:'reset'}}).status,'succeeded');assert.throws(()=>restored.enqueue({id:'old-0',action:'camera',args:{mode:'spin'}}));});
test('only the renderer owner can publish a camera or playback frame',()=>{const s=connected();s.addStructure({frameCount:2},'data');const camera={position:[1,2,3],target:[0,0,0],up:[0,1,0]};s.heartbeat('other',{camera,trajectory:{structureId:'1',frame:1,frameCount:2,playing:true}});assert.equal(s.camera.snapshot,undefined);s.heartbeat('viewer-a',{camera,trajectory:{structureId:'1',frame:1,frameCount:2,playing:true}});assert.deepEqual(s.camera.snapshot,camera);assert.equal(s.trajectory.frame,1);});
test('acknowledged scene edits can be undone without changing source records',()=>{const s=connected();s.addStructure({title:'fixture'},'original data');const c=s.enqueue({action:'hideSelection'});s.claim('viewer-a',c.id);s.complete('viewer-a',{id:c.id,ok:true,patch:{hiddenSelections:[{structureId:'1',kind:'residue',residues:[]}]}});assert.equal(s.snapshot().undo.hiddenSelections.length,0);const undo=s.enqueue({action:'undo'});s.claim('viewer-a',undo.id);s.complete('viewer-a',{id:undo.id,ok:true,patch:s.snapshot().undo});assert.equal(s.snapshot().hiddenSelections.length,0);assert.equal(s.snapshot().undo,null);assert.equal(s.getStructureData('1').data,'original data');});
test('removing a structure invalidates scene undo frames that reference its deleted data',()=>{const s=connected();s.addStructure({title:'fixture'},'original');const c=s.enqueue({action:'setDisplay'});s.claim('viewer-a',c.id);s.complete('viewer-a',{id:c.id,ok:true,patch:{tags:[{id:'site',selection:{structureId:'1'}}]}});assert.ok(s.snapshot().undo);const r=s.enqueue({action:'removeStructure'});s.claim('viewer-a',r.id);s.complete('viewer-a',{id:r.id,ok:true,patch:{removedStructures:['1'],tags:[]}});assert.equal(s.snapshot().undo,null);assert.equal(WorkspaceState.restore(s.serialize()).snapshot().undo,null);});
