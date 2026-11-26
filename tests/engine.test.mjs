import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePDB} from 'molstar/lib/mol-io/reader/pdb/parser';
import {trajectoryFromPDB} from 'molstar/lib/mol-model-formats/structure/pdb';
import {Structure,StructureElement,Unit,Bond} from 'molstar/lib/mol-model/structure';
import {OrderedSet} from 'molstar/lib/mol-data/int';
import {MolEngine} from '../src/viewer/engine.js';
import {residuesFromLoci,atomsFromLoci,buildResidueLoci,extractResidues,lociDistance} from '../src/viewer/selection.js';
const parsed=await parsePDB(readFileSync('fixtures/test-structure.pdb','utf8'),'audit').run();
const tr=await trajectoryFromPDB(parsed.result).run();const structure=Structure.ofModel(tr.representative);const unit=structure.units.find(Unit.isAtomic);
const at=i=>StructureElement.Loci(structure,[{unit,indices:OrderedSet.ofSingleton(i)}]);
const residue={modelId:1,authAsymId:'A',authSeqId:2,insCode:''};
test('residue and atom picks retain correct auth identity',()=>{
  const rs=residuesFromLoci(at(6));assert.equal(rs.length,1);assert.equal(rs[0].authSeqId,2);assert.equal(rs[0].compId,'GLY');
  const as=atomsFromLoci(at(6));assert.equal(as.length,1);assert.equal(as[0].authAtomId,'CA');assert.equal(as[0].authSeqId,2);
  const b=Bond.Loci(structure,[Bond.Location(structure,unit,5,structure,unit,6)]);assert.equal(atomsFromLoci(b).length,1);
});
test('a residue resolves all its atoms and model filtering is honored',()=>{
  assert.equal(StructureElement.Loci.size(buildResidueLoci(structure,{kind:'residue',residues:[residue]})),4);
  assert.equal(StructureElement.Loci.size(buildResidueLoci(structure,{kind:'residue',residues:[{...residue,modelId:999}]})),0);
  assert.equal(extractResidues(structure).length,3);
});
test('transformed atomic coordinates give the physical N-CA distance',()=>{
  assert.ok(Math.abs(lociDistance(at(5),at(6))-1.47578)<0.001);
});
test('ranges and exact atoms are resolved by the engine command target',()=>{
  const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));
  const s=e.resolveTarget({structureId:'1',chainId:'A',start:2,end:3},{});assert.equal(s.residues.length,2);
  const a=e.resolveTarget({structureId:'1',chainId:'A',start:2,end:2,atomName:'CA'},{});assert.equal(a.kind,'atom');assert.equal(StructureElement.Loci.size(e.lociFor(a)),1);
});
test('target lookups reject missing atoms rather than selecting a different atom',()=>{
  const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));
  assert.throws(()=>e.resolveTarget({structureId:'1',chainId:'A',start:2,end:2,atomName:'OG'},{}),e=>e.code==='TARGET_NOT_FOUND');
});
test('readonly sequence commands return structure-grounded numbering',async()=>{
  const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));
  const result=await e.execute({id:'query',action:'getSequence',args:{structureId:'1',chainId:'A'}},{activeStructureId:'1'});
  assert.equal(result.value.chains[0].sequence,'AGS');assert.deepEqual(result.value.chains[0].residues.map(r=>r.authSeqId),[1,2,3]);
});
test('a start without end targets exactly that residue',()=>{const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));const target=e.resolveTarget({structureId:'1',chainId:'A',start:2,atomName:'CA'},{});assert.equal(StructureElement.Loci.size(e.lociFor(target)),1);});
test('inspection reads atomic properties and secondary structure from the loaded structure',async()=>{const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));const r=await e.execute({action:'getResidues',args:{structureId:'1',chainId:'A',start:2}},{activeStructureId:'1'});assert.equal(r.value.atomCount,4);assert.equal(r.value.residueCount,1);assert.equal(r.value.residues[0].compId,'GLY');assert.equal(r.value.atoms[0].occupancy,1);assert.ok(Number.isFinite(r.value.atoms[0].bFactor));assert.equal(r.value.atoms[0].position.length,3);});
test('an atom focus preserves the exact atom and reveals its real bonded residue environment',async()=>{const {focusEnvironment}=await import('../src/viewer/focus.js');const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));const selection=e.resolveTarget({structureId:'1',chainId:'A',start:2,atomName:'CA'},{});const f=focusEnvironment(e,selection);assert.equal(StructureElement.Loci.size(f.exact),1);assert.equal(StructureElement.Loci.size(f.detail),4);assert.ok(StructureElement.Loci.size(f.surroundings)>0);assert.equal(StructureElement.Loci.size(StructureElement.Loci.intersect(f.detail,f.surroundings)),0);});
test('a secondary viewer follows subsequent authoritative trajectory frames',async()=>{const {restoreView}=await import('../src/viewer/output.js');const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));e.models.set('1','model');e.trajectories.set('1',{frame:0,frameCount:2});let updates=0;const builder={to(){return this;},update(fn){this.index=fn({modelIndex:0}).modelIndex;return this;},async commit(){updates++;}};e.plugin={state:{data:{build:()=>builder}}};e.structureNode=()=>undefined;await restoreView(e,{trajectory:{structureId:'1',frame:0}});await restoreView(e,{trajectory:{structureId:'1',frame:1}});assert.equal(e.trajectories.get('1').frame,1);assert.ok(updates>=1);});
test('focus details stay hidden with their structure and return when it is shown',async()=>{const {syncFocus}=await import('../src/viewer/focus.js');const e=new MolEngine();e.structures.set('1',structure);e.residues.set('1',extractResidues(structure));e.structureRefs.set('1','root');let created=0;e.plugin={state:{data:{cells:new Map()}},builders:{structure:{tryCreateComponent:async()=>{created++;return null;}}}};const selection=e.resolveTarget({structureId:'1',chainId:'A',start:2},{});e.stateCache={structures:[{structureId:'1',display:{visible:false}}]};await syncFocus(e,selection);assert.equal(created,0);e.stateCache.structures[0].display.visible=true;await syncFocus(e,selection);assert.ok(created>0);});
