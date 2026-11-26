import test from 'node:test';
import assert from 'node:assert/strict';
import {themeScheme,canvasBackground} from '../src/shared/theme.js';
import {molecularReferenceSource} from '../src/client/references.js';
import {WorkspaceState} from '../src/host/workspace-state.js';

test('host theme wins over system preference and explicit figure backgrounds remain explicit',()=>{assert.equal(themeScheme({active:{colorScheme:'light'}}),'light');assert.equal(themeScheme({active:{colorScheme:'dark'}}),'dark');assert.equal(canvasBackground('light'),'#f7f8fb');assert.equal(canvasBackground('dark'),'#0b0c10');assert.equal(canvasBackground('light',{background:'#ff0000'}),'#ff0000');});
test('native DSH citation captures exact context and serializes it without later selection drift',async()=>{
 const s=new WorkspaceState();s.workspaceId='session-a';const ref=s.addStructure({title:'fixture.pdb',source:{path:'fixture.pdb'}},'ATOM...','sha256');s.setSelection({structureId:ref.structureId,kind:'atom',atoms:[{modelId:1,authAsymId:'A',authSeqId:2,authAtomId:'CA',altId:''}]});
 const source=molecularReferenceSource({getState:async()=>({ok:true,value:s.snapshot()})},{openTab(){}});const rows=await source.candidates({sessionId:'session-a'},{query:''});const row=rows.find(x=>x.name==='Current molecular selection');assert.ok(row);const picked=source.onPick({candidate:row}).insert;s.setSelection(null);const text=await source.codec.serialize(picked.ref);const context=JSON.parse(text.slice(text.indexOf('\n')+1));assert.equal(context.selection.atoms[0].authAtomId,'CA');assert.equal(context.structure.contentHash,'sha256');assert.equal(context.workspaceId,'session-a');assert.equal(picked.source,'molecular');
});
test('Add to Chat inserts a native composer reference and preserves its captured span',async()=>{const {insertMolecularCitation}=await import('../src/client/composer.js');let outcome,receivedSpan;const span={start:7,end:7,draftRev:4};const binding={ctx:{}};const services={sessions:{binding:()=>binding},conversation:{input:{for:()=>({actions:{captureInsertion:()=>span}})}},inputTriggers:{sessionOf:()=>({execute:(o,s)=>{outcome=o;receivedSpan=s;return true;}})}};const result=insertMolecularCitation({get:k=>services[k]},'session',{structure:{title:'TOP7'},selection:{kind:'residue'}},'TOP7 · A:42–58');assert.equal(result.delivery,'composer');assert.equal(outcome.insert.source,'molecular');assert.equal(outcome.insert.label,'TOP7 · A:42–58');assert.deepEqual(receivedSpan,span);services.inputTriggers.sessionOf=()=>({execute:()=>false});assert.throws(()=>insertMolecularCitation({get:k=>services[k]},'session',{structure:{title:'TOP7'}}),/not inserted/);});


test('captured MD references retain their acknowledged frame after playback advances',async()=>{
 const {captureContext}=await import('../src/shared/citations.js');const {selectionCitationLabel}=await import('../src/client/composer.js');
 const s=new WorkspaceState();const ref=s.addStructure({title:'MD',frameCount:60},'data');s.trajectory={structureId:ref.structureId,frame:33,frameCount:60,playing:false};
 const c=captureContext(s.snapshot(),{structureId:ref.structureId,selection:null});s.trajectory.frame=40;
 assert.equal(c.trajectory.frame,33);assert.equal(c.trajectory.frameIndexBase,0);assert.match(selectionCitationLabel(c),/frame 34\/60/);
});
test('MD citation capture waits for pause acknowledgement and propagates failure',async()=>{
 const {pauseForCitation}=await import('../src/shared/citation-frame.js');let polls=0;
 const adapter={enqueueCommand:async c=>{assert.equal(c.action,'trajectory');assert.equal(c.args.mode,'pause');return{id:'capture'};},getCommand:async()=>++polls===1?{status:'running'}:{status:'succeeded',result:{frame:33}}};
 assert.equal((await pauseForCitation(adapter,'1',{pollMs:1})).frame,33);assert.equal(polls,2);
 adapter.getCommand=async()=>({status:'failed',error:{code:'TARGET_NOT_FOUND',message:'trajectory removed'}});
 await assert.rejects(pauseForCitation(adapter,'1'),e=>e.code==='TARGET_NOT_FOUND');
});