import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PluginContext} from 'molstar/lib/mol-plugin/context';
import {DefaultPluginSpec} from 'molstar/lib/mol-plugin/spec';
import {StructureElement} from 'molstar/lib/mol-model/structure';
import {OrderedSet} from 'molstar/lib/mol-data/int';
import {stabilizeMdModelIdentity} from '../src/viewer/md-trajectory.js';
import {createTrackingSelection,measurementGeometryFromLoci} from '../src/viewer/measurement-tracking.js';
test('MD measurement endpoints and distance follow actual frame changes without a stale bundle hash',async()=>{
 const plugin=new PluginContext(DefaultPluginSpec());await plugin.init();
 try{
  const lines=readFileSync('fixtures/test-structure.pdb','utf8').split(/\r?\n/).filter(l=>l.startsWith('ATOM')).map(l=>Number(l.slice(22,26))>1?l.slice(0,21)+'B'+l.slice(22):l);
  const moved=lines.map((l,i)=>i===5?l.slice(0,30)+(Number(l.slice(30,38))+2).toFixed(3).padStart(8)+l.slice(38):l);
  const raw=await plugin.builders.data.rawData({data:'MODEL        1\n'+lines.join('\n')+'\nENDMDL\nMODEL        2\n'+moved.join('\n')+'\nENDMDL\nEND\n'});
  const tr=await plugin.builders.structure.parseTrajectory(raw,'pdb');stabilizeMdModelIdentity(tr.obj.data,1);
  const model=await plugin.builders.structure.createModel(tr),s=await plugin.builders.structure.createStructure(model,{name:'model',params:{}});
  const st=s.obj.data;assert.ok(st.units.length>1);
  const one=(unit,i)=>StructureElement.Loci(st,[{unit,indices:OrderedSet.ofSingleton(i)}]);
  const locis=[one(st.units[0],0),one(st.units[1],0)];
  const component=await plugin.builders.structure.tryCreateComponent(s,{type:{name:'expression',params:StructureElement.Loci.toExpression(locis[1])},nullIfEmpty:true,label:'Moving atom'},'moving-atom');
  const selection=await createTrackingSelection(plugin,locis,'Tracked contact');
  const initial=measurementGeometryFromLoci('distance',selection.obj.data.map(x=>x.loci)).value;
  await plugin.state.data.build().to(model).update(old=>({...old,modelIndex:1})).commit();
  const current=plugin.state.data.cells.get(selection.ref).obj.data;
  assert.ok(current.every(x=>StructureElement.Loci.size(x.loci)===1));
  const next=measurementGeometryFromLoci('distance',current.map(x=>x.loci)).value;
  assert.ok(Math.abs(initial-next)>.1);assert.ok(Number.isFinite(next));
  const moving=plugin.state.data.cells.get(component.ref).obj.data;assert.equal(moving.elementCount,1);assert.notEqual(moving.models[0],st.models[0]);
 }finally{plugin.dispose();}
});
