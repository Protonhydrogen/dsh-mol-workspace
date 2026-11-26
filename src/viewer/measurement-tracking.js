import {StructureElement} from 'molstar/lib/mol-model/structure';
import {StateTransforms} from 'molstar/lib/mol-plugin-state/transforms';
import {atomPosition,atomsFromLoci} from './selection.js';
import {measurementGeometry} from './measurements.js';
import {failure} from '../shared/model.js';

export function measurementGeometryFromLoci(type,locis){
 const positions=[];
 for(const loci of locis){
  if(!loci||StructureElement.Loci.isEmpty(loci))throw failure('TARGET_NOT_FOUND','Measurement endpoint is missing');
  StructureElement.Loci.forEachLocation(loci,loc=>{const p=atomPosition(loc);if(!p)throw failure('TARGET_NOT_FOUND','No atomic coordinates');positions.push([p.x,p.y,p.z]);});
 }
 return measurementGeometry(type,positions);
}
export function measurementPoints(e,record){
 const locis=record.points.map(sel=>record.type==='orientation'?e.lociFor(sel):e.pointLoci(sel));
 const geometry=measurementGeometryFromLoci(record.type,locis);
 const actual=locis.map((loci,i)=>{const location=StructureElement.Loci.getFirstLocation(loci),p=atomPosition(location);return {atom:atomsFromLoci(loci)[0],structureId:record.points[i].structureId,position:[p.x,p.y,p.z]};});
 return {locis,geometry,actual};
}
export function measurementSignature(record){
 const {value,unit,geometry,actualPoints,...definition}=record;return JSON.stringify(definition);
}
export function refreshMeasurementValues(e,sid){
 for(const item of e.measurementItems?.values()??[]){
  if(!item.record.points.some(p=>p.structureId===sid))continue;
  const {geometry,actual}=measurementPoints(e,item.record);
  item.record={...item.record,...geometry,actualPoints:actual};
 }
}
export function currentMeasurements(e,state){
 return (state.measurements??[]).map(m=>e.measurementItems.get(m.id)?.record??m);
}
export async function createTrackingSelection(plugin,locis,label){
 const selections=locis.map((loci,i)=>{
  const cell=plugin.helpers.substructureParent.get(loci.structure);
  if(!cell)throw failure('TARGET_NOT_FOUND','Measurement source is unavailable');
  return {key:String(i),groupId:String(i),ref:cell.transform.ref,expression:StructureElement.Loci.toExpression(loci)};
 });
 // Bundles are keyed by a structure hash that changes with an MD frame.
 // Expressions retain source atom indices and follow the live structure.
 return plugin.managers.structure.measurement.getGroup()
  .apply(StateTransforms.Model.MultiStructureSelectionFromExpression,{selections,isTransitive:true,label},{dependsOn:[...new Set(selections.map(s=>s.ref))]}).commit();
}
export async function addTrackingMeasurement(e,record,locis,options){
 const selection=await createTrackingSelection(e.plugin,locis,record.name);
 const name={distance:'Distance',angle:'Angle',dihedral:'Dihedral',label:'Label',orientation:'Orientation',plane:'Plane'}[record.type];
 try{
  const representation=await e.plugin.state.data.build().to(selection)
   .apply(StateTransforms.Representation['StructureSelections'+name+'3D'],{...options.lineParams,...options.labelParams}).commit();
  return {selection,representation};
 }catch(error){await e.plugin.state.data.build().delete(selection.ref).commit();throw error;}
}
