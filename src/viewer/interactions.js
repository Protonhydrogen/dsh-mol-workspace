import {StructureElement} from 'molstar/lib/mol-model/structure';
import {Task} from 'molstar/lib/mol-task';
import {OrderedSet} from 'molstar/lib/mol-data/int';
import {InteractionsProvider} from 'molstar/lib/mol-model-props/computed/interactions';
import {InteractionFlag,interactionTypeLabel} from 'molstar/lib/mol-model-props/computed/interactions/common';
import {atomsFromLoci,atomPosition} from './selection.js';
import {failure} from '../shared/model.js';
export async function inspectInteractions(e,args,state){
 const selection=e.resolveTarget(args,state),structure=e.structures.get(selection.structureId),selected=e.lociFor(selection),limit=Number(args.limit??200);
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw failure('INVALID_ARGUMENT','limit must be 1–1000');
 const task=Task.create('Compute potential non-covalent interactions',runtime=>InteractionsProvider.attach({runtime,assetManager:e.plugin?.managers.asset},structure));if(e.plugin?.runTask)await e.plugin.runTask(task);else await task.run();
 const value=InteractionsProvider.get(structure).value;if(!value)throw failure('UNSUPPORTED_CAPABILITY','Interactions require an atomic structure');
 const selectedIndices=new Map(selected.elements.map(x=>[x.unit.id,new Set(OrderedSet.toArray(x.indices))])),contacts=[];let count=0;
 const endpoint=(unitId,index)=>{const unit=structure.unitMap.get(unitId),features=value.unitsFeatures.get(unitId),members=[];let selected=false;
  for(let n=features.offsets[index];n<features.offsets[index+1];n++){const i=features.members[n];members.push(i);if(selectedIndices.get(unitId)?.has(i))selected=true;}
  return {unit,members,selected};};
 const serialize=f=>{const atoms=[],position=[0,0,0];for(const i of f.members){const loc={unit:f.unit,element:f.unit.elements[i]},p=atomPosition(loc);if(p){position[0]+=p.x;position[1]+=p.y;position[2]+=p.z;}const loci=StructureElement.Loci(structure,[{unit:f.unit,indices:OrderedSet.ofSingleton(i)}]);atoms.push(atomsFromLoci(loci)[0]);}return {atoms,position:position.map(v=>v/f.members.length)};};
 const add=(ua,a,ub,b,type,flag)=>{if(flag===InteractionFlag.Filtered)return;const first=endpoint(ua,a),second=endpoint(ub,b);if(!first.selected&&!second.selected)return;count++;if(contacts.length<limit){const A=serialize(first),B=serialize(second);contacts.push({type:interactionTypeLabel(type),a:A,b:B,distance:Math.hypot(...A.position.map((v,i)=>v-B.position[i])),distanceUnit:'Å'});}};
 for(const [unitId,graph] of value.unitsContacts)for(let i=0;i<graph.a.length;i++)if(graph.a[i]<graph.b[i])add(unitId,graph.a[i],unitId,graph.b[i],graph.edgeProps.type[i],graph.edgeProps.flag[i]);
 for(const edge of value.contacts.edges)if(edge.unitA<edge.unitB)add(edge.unitA,edge.indexA,edge.unitB,edge.indexB,edge.props.type,edge.props.flag);
 return {value:{structureId:selection.structureId,selection,contactCount:count,contacts,truncated:count>contacts.length,method:'Molstar default geometric and chemical rules; potential contacts, not measured interaction energies'},patch:{}};
}
