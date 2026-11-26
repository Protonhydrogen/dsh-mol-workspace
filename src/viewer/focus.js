import {InteractionsRepresentationProvider} from 'molstar/lib/mol-model-props/computed/representations/interactions';
import {InteractionTypeColorThemeProvider} from 'molstar/lib/mol-model-props/computed/themes/interaction-type';
import {StructureElement,Unit} from 'molstar/lib/mol-model/structure';
import {OrderedSet} from 'molstar/lib/mol-data/int';
import {atomPosition,residuesFromLoci} from './selection.js';
import {FOCUS_CARBON, CONTEXT_CARBON, carbonColor} from './palette.js';
import {clone} from '../shared/model.js';
export const focusInteractionStyle={type:'interactions',color:'interaction-type',size:'uniform',typeParams:{sizeFactor:.16}};
export function focusEnvironment(e,selection,radius=5){
 const exact=e.lociFor(selection);if(!exact||StructureElement.Loci.isEmpty(exact))return null;
 const sid=selection.structureId,structure=e.structures.get(sid);
 const detail=e.lociFor({structureId:sid,kind:'residue',residues:residuesFromLoci(exact)});
 if(StructureElement.Loci.size(detail)>1500)return {exact,detail:null,surroundings:null};
 const near=new Map();StructureElement.Loci.forEachLocation(detail,l=>{
  const p=atomPosition(l);if(!p)return;const found=structure.lookup3d.find(p.x,p.y,p.z,radius);
  for(let i=0;i<found.count;i++){const unit=found.units[i];if(!Unit.isAtomic(unit))continue;if(!near.has(unit.id))near.set(unit.id,{unit,indices:new Set()});near.get(unit.id).indices.add(found.indices[i]);}
 });
 const loci=StructureElement.Loci(structure,[...near.values()].map(v=>({unit:v.unit,indices:OrderedSet.ofSortedArray([...v.indices].sort((a,b)=>a-b))})));
 const whole=e.lociFor({structureId:sid,kind:'residue',residues:residuesFromLoci(loci)});
 return {exact,detail,surroundings:StructureElement.Loci.subtract(whole,detail)};
}
export function syncFocus(e,selection){const task=(e.focusQueue??Promise.resolve()).then(()=>applyFocus(e,selection));e.focusQueue=task.catch(()=>{});return task;}
async function applyFocus(e,selection){
 const visible=(e.stateCache?.structures??[]).find(s=>s.structureId===selection?.structureId)?.display?.visible!==false;
 const signature=JSON.stringify({selection:selection??null,visible}),refs=e.focusItems??[];
 if(e.focusSignature===signature&&refs.every(ref=>e.plugin.state.data.cells.has(ref)))return;
 if(refs.length){const update=e.plugin.state.data.build();for(const ref of refs)if(e.plugin.state.data.cells.has(ref))update.delete(ref);await update.commit();}
 e.focusItems=[];e.focusSignature=signature;e.focusTarget=clone(selection);
 if(!selection||!visible)return;const environment=focusEnvironment(e,selection);if(!environment?.detail)return;
 const add=async(loci,name,alpha,sizeFactor,carbon)=>{
  if(StructureElement.Loci.isEmpty(loci))return;
  const component=await e.plugin.builders.structure.tryCreateComponent(e.structureRefs.get(selection.structureId),{type:{name:'bundle',params:StructureElement.Bundle.fromLoci(loci)},nullIfEmpty:true,label:name},name);
  if(!component)return;await e.plugin.builders.structure.representation.addRepresentation(component,{type:'ball-and-stick',typeParams:{alpha,sizeFactor},color:'element-symbol',colorParams:carbonColor(carbon)});e.focusItems.push(component.ref);
 };
 await add(environment.surroundings,'Focus surroundings · 5 Å',.85,.16,CONTEXT_CARBON);await add(environment.detail,'Focused molecular detail',1,.22,FOCUS_CARBON);
 const neighborhood=StructureElement.Loci.union(environment.detail,environment.surroundings);
 const component=await e.plugin.builders.structure.tryCreateComponent(e.structureRefs.get(selection.structureId),{type:{name:'bundle',params:StructureElement.Bundle.fromLoci(neighborhood)},nullIfEmpty:true,label:'Potential non-covalent interactions · Molstar'},'focus-interactions');
 if(component){await e.plugin.builders.structure.representation.addRepresentation(component,focusInteractionStyle);e.focusItems.push(component.ref);}
}



