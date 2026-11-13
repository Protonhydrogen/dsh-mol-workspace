import {inspectInteractions} from './interactions.js';
import {representationParams,presetRepresentation,representationColorParams} from './representation-style.js';
import {applyClipping,DEFAULT_CLIPPING} from './view-settings.js';
import { inspectTarget } from './inspect.js';
import { StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { checkColor, clone, failure, id, validateDisplay } from '../shared/model.js';
import { normalizeSelection } from '../shared/selection.js';
import { atomPosition, atomsFromLoci, extractResidues, residuesFromLoci } from './selection.js';
import { chainsOf } from './targets.js';
import { measurementGeometry } from './measurements.js';
import { exportImage, exportStructure, trajectory, alignStructures, exportVideo } from './output.js';

/** Surface and electrostatics options that a layer must carry into its record. */
const LAYER_SURFACE_KEYS = ['representations','probeRadius','smoothness','dielectric','ionicStrength','potentialRange','sizeFactor','quality'];

/**
 * Build a layer record from createLayer arguments. Exported so the option
 * plumbing can be tested without a live Mol* plugin: these fields were once
 * dropped here, which silently disabled per-layer surfaces and potentials.
 */
export function buildLayerRecord(a,selection,makeId){
  const surface={};
  for(const k of LAYER_SURFACE_KEYS)if(a[k]!=null)surface[k]=a[k];
  return {
    id:a.id??makeId(),
    name:String(a.name??'Selection layer'),
    selection,
    color:a.colorValue??(typeof a.color==='string'&&a.color.startsWith('#')?a.color:'#8b5cf6'),
    visible:true,
    display:{representation:a.representation??'ball-and-stick',opacity:a.opacity??1,color:a.color&&!a.color.startsWith('#')?a.color:'uniform',...surface},
  };
}

export async function createLayer(e,record){
  const selection=e.resolveTarget({selection:record.selection,structureId:record.selection.structureId},e.stateCache);
  const loci=e.lociFor(selection);const ref=e.structureRefs.get(selection.structureId);
  const c=await e.plugin.builders.structure.tryCreateComponent(ref,{type:{name:'bundle',params:StructureElement.Bundle.fromLoci(loci)},nullIfEmpty:true,label:record.name},record.id);
  if(!c)throw failure('TARGET_NOT_FOUND','Layer selection is empty');
  const style=record.display??{};const color=record.color??style.colorValue??'#8b5cf6';checkColor(color);
  // Reject out-of-range surface / electrostatics values here rather than letting
  // them reach Mol* as NaNs.
  if(style.probeRadius!=null||style.dielectric!=null||style.ionicStrength!=null||style.potentialRange!=null)validateDisplay(style);
  // A layer is how a *local* patch gets its own surface: the selection subset
  // becomes its own component, so the electrostatic table must be ready first.
  if(style.color==='electrostatic')e.ensurePotential(selection.structureId,style);
  for(const rawType of style.representations??[presetRepresentation(style.representation??'ball-and-stick')]){
    const type=presetRepresentation(rawType);
    await e.plugin.builders.structure.representation.addRepresentation(c,{type,typeParams:representationParams(style,{},type),color:style.color??'uniform',colorParams:representationColorParams({...style,colorValue:color})});
  }
  setSubtreeVisibility(e.plugin.state.data,c.ref,record.visible===false);
  e.layerItems.set(record.id,{ref:c.ref,record:clone(record),signature:JSON.stringify(record)});
  return record;
}
export async function removeVisual(e,map,itemId){
  const item=map.get(itemId);if(!item)return;
  if(e.plugin.state.data.cells.has(item.ref))await e.plugin.state.data.build().delete(item.ref).commit();
  map.delete(itemId);
}

function pointsFor(e,record){
  const selections=record.points;const locis=[],positions=[],actual=[];
  for(const sel of selections){
    const loci=record.type==='orientation'?e.lociFor(sel):e.pointLoci(sel);
    if(!loci||StructureElement.Loci.isEmpty(loci))throw failure('TARGET_NOT_FOUND','Measurement endpoint is missing');
    locis.push(loci);
    StructureElement.Loci.forEachLocation(loci,loc=>{const p=atomPosition(loc);if(!p)throw failure('TARGET_NOT_FOUND','No atomic coordinates');positions.push([p.x,p.y,p.z]);});
    actual.push({atom:atomsFromLoci(loci)[0],structureId:sel.structureId,position:positions.at(-1)});
  }
  return {locis,positions,actual};
}
export async function createMeasurement(e,record){
  const {locis,positions,actual}=pointsFor(e,record);
  const geometry=measurementGeometry(record.type,positions);
  const style=record.style??{};validateDisplay({opacity:style.opacity});if(style.geometry&&!['box','axes','ellipsoid'].includes(style.geometry))throw failure('INVALID_ARGUMENT','Orientation geometry must be box, axes or ellipsoid');const color=checkColor(style.color??'#a78bfa');
  const mgr=e.plugin.managers.structure.measurement;
  let result;
  const options={lineParams:{linesColor:color},labelParams:{textColor:color,customText:record.text??''}};
  if(record.type==='distance')result=await mgr.addDistance(...locis,options);
  else if(record.type==='angle')result=await mgr.addAngle(...locis,options);
  else if(record.type==='dihedral')result=await mgr.addDihedral(...locis,options);
  else if(record.type==='label')result=await mgr.addLabel(locis[0],options);
  else if(record.type==='plane')result=await mgr.addPlane(locis);
  else if(record.type==='orientation')result=await mgr.addOrientation(locis);
  if(!result?.selection?.ref)throw failure('EXECUTION_FAILED','Mol* did not create this measurement');
  await e.plugin.state.data.build().to(result.representation.ref).update(old=>({...old,color,linesColor:color,textColor:color,sectorColor:color,alpha:style.opacity??(record.type==='plane'?0.35:1),...(record.type==='orientation'?{visuals:[style.geometry??'box']}:{}),...(record.text?{customText:record.text}:{})})).commit();
  setSubtreeVisibility(e.plugin.state.data,result.selection.ref,record.visible===false);
  const completed={...record,...geometry,actualPoints:actual};
  e.measurementItems.set(record.id,{ref:result.selection.ref,representationRef:result.representation.ref,record:completed,signature:JSON.stringify(record)});
  return completed;
}

export async function syncObjects(e,state){
  const layers=[...(state.layers??[]),...(state.tags??[])];
  for(const [key] of e.layerItems)if(!layers.some(l=>l.id===key))await removeVisual(e,e.layerItems,key);
  for(const l of layers){
    const item=e.layerItems.get(l.id);
    if(!item||!e.plugin.state.data.cells.has(item.ref)||item.signature!==JSON.stringify(l)){
      await removeVisual(e,e.layerItems,l.id);await createLayer(e,l);
    }
    const live=e.layerItems.get(l.id);if(live)setSubtreeVisibility(e.plugin.state.data,live.ref,l.visible===false||state.structures.find(s=>s.structureId===l.selection.structureId)?.display?.visible===false);
  }
  for(const [key] of e.measurementItems)if(!(state.measurements??[]).some(m=>m.id===key))await removeVisual(e,e.measurementItems,key);
  for(const m of state.measurements??[]){
    const item=e.measurementItems.get(m.id);
    if(!item||!e.plugin.state.data.cells.has(item.ref)||JSON.stringify(item.record)!==JSON.stringify(m)){
      await removeVisual(e,e.measurementItems,m.id);await createMeasurement(e,m);
    }
  }
}

export async function executeOperation(e,command,state){
  const a=command.args??{},action=command.action;const sid=String(a.structureId??a.selection?.structureId??state.activeStructureId??e.activeStructureId??'');
  if(action==='hideSelection'){
    const target=e.resolveTarget(a,state),selection=normalizeSelection({structureId:target.structureId,kind:'residue',residues:residuesFromLoci(e.lociFor(target))});
    const patch={hiddenSelections:[...(state.hiddenSelections??[]),selection],selection:null,focus:null,highlight:null};await e.sync({...state,...patch});return {value:{hiddenResidueCount:selection.residues.length,sourceUnchanged:true},patch};
  }
  if(action==='undo'){
    if(!state.undo)throw failure('INVALID_ARGUMENT','There is no molecular edit to undo');const patch=clone(state.undo),next={...state,...patch,structures:state.structures.map(s=>({...s,...patch.structureUpdates.find(u=>u.structureId===s.structureId)}))};await e.sync(next);return {value:{undone:true},patch};
  }  if(action==='getInteractions')return inspectInteractions(e,a,state);
  if(action==='getResidues')return inspectTarget(e,a,state);
  if(action==='getStructureInfo')return {value:{...e.metadata(sid),display:state.structures?.find(s=>s.structureId===sid)?.display,
    renderedRepresentations:(e.structureNode(sid)?.components??[]).flatMap(component=>component.representations.map(r=>({component:component.cell.obj?.label,type:r.cell.transform.params?.type?.name,status:r.cell.status,visible:!r.cell.state.isHidden,alpha:r.cell.transform.params?.type?.params?.alpha,sizeFactor:r.cell.transform.params?.type?.params?.sizeFactor,material:clone(r.cell.transform.params?.type?.params?.material),renderObjectCount:r.cell.obj?.data?.repr?.renderObjects?.length??0}))),
    cameraClipping:clone(e.plugin.canvas3d.props.cameraClipping)},patch:{}};
  if(action==='getSequence')return {value:{structureId:sid,chains:chainsOf(e.residues.get(sid)??[]).filter(c=>a.chainId==null||c.chainId===a.chainId||c.labelChainId===a.chainId)},patch:{}};
  if(['select','focus','highlight'].includes(action)){
    const selection=e.resolveTarget(a,state);e.setActiveStructure(selection.structureId);await e[action](selection);
    return {value:{selection,atomCount:StructureElement.Loci.size(e.lociFor(selection))},patch:{[action==='select'?'selection':action]:selection,activeStructureId:selection.structureId}};
  }
  if(action==='clearSelection'){
    await e.overview();
    return {value:{cleared:true,overview:true},patch:{selection:null,focus:null,highlight:null,camera:{...state.camera,clipping:DEFAULT_CLIPPING}}};
  }
  if(action==='setDisplay'){
    if(a.layerId){
      const key=(state.tags??[]).some(l=>l.id===a.layerId)?'tags':'layers';const records=clone(state[key]??[]);const item=records.find(l=>l.id===a.layerId);if(!item)throw failure('TARGET_NOT_FOUND','Layer not found');
      validateDisplay(a);item.display={...(a.resetStyle?{representation:'ball-and-stick',color:'uniform',opacity:1}:item.display),...a};delete item.display.resetStyle;if(a.representation&&!Object.hasOwn(a,'representations'))delete item.display.representations;if(a.colorValue)item.color=a.colorValue;
      await removeVisual(e,e.layerItems,item.id);await createLayer(e,item);return {value:item,patch:{[key]:records}};
    }
    const refs=a.all?state.structures:state.structures.filter(s=>s.structureId===sid);if(!refs.length)throw failure('TARGET_NOT_FOUND','Target structure is not loaded');
    const updates=[];for(const s of refs){
      const display=validateDisplay({...(a.resetStyle?{representation:'auto',color:'chain-id',opacity:1,visible:s.display?.visible!==false}:s.display),...a});for(const k of ['structureId','all','layerId','resetStyle'])delete display[k];if(a.representation&&!Object.hasOwn(a,'representations'))delete display.representations;
      await e.applyDisplay(s.structureId,display,a.resetStyle?undefined:e.displayCache.get(s.structureId));e.displayCache.set(s.structureId,clone(display));updates.push({structureId:s.structureId,display});
    }
    await syncObjects(e,state);return {value:{structures:updates},patch:{structureUpdates:updates}};
  }
  if(action==='setVisibility'){
    if(a.kind==='tag'||a.kind==='layer'||a.kind==='measurement'){
      const key=a.kind==='tag'?'tags':a.kind==='layer'?'layers':'measurements';const records=clone(state[key]??[]);const item=records.find(v=>v.id===a.id);if(!item)throw failure('TARGET_NOT_FOUND','Scene object not found');item.visible=a.visible!==false;
      const map=a.kind==='measurement'?e.measurementItems:e.layerItems;const visual=map.get(item.id);if(visual)setSubtreeVisibility(e.plugin.state.data,visual.ref,!item.visible);
      if(visual){visual.record=clone(item);visual.signature=JSON.stringify(item);}
      return {value:item,patch:{[key]:records}};
    }
    const ref=state.structures.find(s=>s.structureId===sid);const node=e.structureNode(sid);if(!ref||!node)throw failure('TARGET_NOT_FOUND','Structure is not loaded');
    const display={...ref.display,visible:a.visible!==false};setSubtreeVisibility(e.plugin.state.data,node.cell.transform.ref,!display.visible);e.displayCache.set(sid,display);
    return {value:{structureId:sid,visible:display.visible},patch:{structureUpdates:[{structureId:sid,display}]}};
  }
  if(action==='createTag'||action==='createLayer'){
    const selection=e.resolveTarget(a,state);
    // Surface and electrostatics options must survive into the layer record, or a
    // layer could never carry its own solvent surface or potential colouring.
    const record=buildLayerRecord(a,selection,()=>id(action==='createTag'?'tag':'layer'));
    record.name=String(a.name??(action==='createTag'?'Tag':'Selection layer'));
    if(!record.name.trim())throw failure('INVALID_ARGUMENT','A name is required');checkColor(record.color);
    const key=action==='createTag'?'tags':'layers';if(state[key].some(l=>l.id===record.id))throw failure('INVALID_ARGUMENT','Object ID already exists');
    await createLayer(e,record);return {value:record,patch:{[key]:[...state[key],record]}};
  }
  if(action==='removeTag'||action==='removeLayer'){
    const key=action==='removeTag'?'tags':'layers';if(!state[key].some(l=>l.id===a.id))throw failure('TARGET_NOT_FOUND','Object not found');await removeVisual(e,e.layerItems,a.id);return {value:{removed:a.id},patch:{[key]:state[key].filter(l=>l.id!==a.id)}};
  }
  if(action==='createMeasurement'){
    const type=a.type??'distance';let points;
    if(a.points?.length)points=a.points.map(p=>e.resolveTarget(p.selection||!p.kind?{...p,structureId:p.structureId??sid}:{selection:p,structureId:p.structureId??sid},state));
    else {
      const selection=e.resolveTarget(a,state);
      if(type==='orientation')points=[selection];
      else if(selection.kind==='atom')points=selection.atoms.map(atom=>normalizeSelection({structureId:sid,kind:'atom',atoms:[atom]}));
      else points=selection.residues.map(r=>normalizeSelection({structureId:sid,kind:'residue',residues:[r]}));
      if(type==='label')points=points.slice(0,1);
    }
    const record={id:a.id??id('measure'),name:String(a.name??type),type,points,text:String(a.text??''),style:{color:a.colorValue??'#a78bfa',opacity:a.opacity??(type==='plane'?0.35:1),geometry:a.geometry??'box'},visible:true};
    if(state.measurements.some(m=>m.id===record.id))throw failure('INVALID_ARGUMENT','Measurement ID already exists');
    const result=await createMeasurement(e,record);return {value:result,patch:{measurements:[...state.measurements,result]}};
  }
  if(action==='removeMeasurement'||action==='clearMeasurements'){
    const removed=action==='clearMeasurements'?state.measurements:state.measurements.filter(m=>m.id===a.id);
    if(action==='removeMeasurement'&&!removed.length)throw failure('TARGET_NOT_FOUND','Measurement not found');
    for(const item of removed)await removeVisual(e,e.measurementItems,item.id);
    return {value:{removed:removed.map(v=>v.id)},patch:{measurements:state.measurements.filter(m=>!removed.some(r=>r.id===m.id))}};
  }
  if(action==='styleMeasurement'){
    const records=clone(state.measurements);const item=records.find(m=>m.id===a.id);if(!item)throw failure('TARGET_NOT_FOUND','Measurement not found');
    item.style={...item.style,...(a.colorValue?{color:a.colorValue}:{}),...(a.opacity!=null?{opacity:a.opacity}:{}),...(a.geometry?{geometry:a.geometry}:{})};
    await removeVisual(e,e.measurementItems,item.id);const updated=await createMeasurement(e,item);return {value:updated,patch:{measurements:records.map(m=>m.id===updated.id?updated:m)}};
  }
  if(action==='camera'){
    if(a.mode==='focus'){const selection=e.resolveTarget(a,state);await e.focus(selection);}
    else if(a.mode==='reset'){await e.overview();return {value:{mode:'reset',overview:true},patch:{selection:null,focus:null,highlight:null,camera:{...state.camera,clipping:DEFAULT_CLIPPING}}};}
    else if(a.mode==='clipping'){const clipping={...DEFAULT_CLIPPING,...state.camera?.clipping,...a};for(const key of ['mode','structureId'])delete clipping[key];applyClipping(e,clipping);return {value:{clipping},patch:{camera:{...state.camera,clipping}}};}
    else if(a.mode==='spin')e.plugin.canvas3d.setProps({trackball:{animate:a.enabled===false?{name:'off',params:{}}:{name:'spin',params:{speed:Number(a.speed??0.1),axis:[0,1,0]}}}});
    else throw failure('INVALID_ARGUMENT','Camera mode must be reset, focus, clipping or spin');
    return {value:{mode:a.mode,enabled:a.enabled!==false},patch:{camera:{...state.camera,...a}}};
  }
  if(action==='previewImage')return exportImage(e,{...a,width:640,height:360},state);
  if(action==='exportImage')return exportImage(e,a,state);
  if(action==='exportStructure')return exportStructure(e,a,state);
  if(action==='trajectory')return a.mode==='video'?exportVideo(e,a,state):trajectory(e,a,state);
  if(action==='align')return alignStructures(e,a,state);
  if(action==='neighbors'){
    const selected=e.resolveTarget(a,state),loci=e.lociFor(selected);const seeds=[];StructureElement.Loci.forEachLocation(loci,l=>{const p=atomPosition(l);seeds.push([p.x,p.y,p.z]);});
    const radius=Number(a.radius??5);if(!(radius>0&&radius<=100))throw failure('INVALID_ARGUMENT','Radius must be in (0, 100] Å');
    const buckets=new Map(),size=radius;const key=p=>p.map(x=>Math.floor(x/size)).join(',');
    for(const p of seeds){const k=key(p);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(p);}
    const result=[];const structure=e.structures.get(sid);
    for(const unit of structure.units){if(!Unit.isAtomic(unit))continue;const indices=[];for(let i=0;i<unit.elements.length;i++){
      const p=atomPosition({unit,element:unit.elements[i]});const xyz=[p.x,p.y,p.z],cell=xyz.map(x=>Math.floor(x/size));let hit=false;
      for(let x=-1;x<=1&&!hit;x++)for(let y=-1;y<=1&&!hit;y++)for(let z=-1;z<=1&&!hit;z++)hit=(buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))??[]).some(s=>(s[0]-p.x)**2+(s[1]-p.y)**2+(s[2]-p.z)**2<=radius*radius);
      if(hit)indices.push(i);
    }if(indices.length)result.push({unit,indices:OrderedSet.ofSortedArray(indices)});}
    const rs=residuesFromLoci(StructureElement.Loci(structure,result));const selection=normalizeSelection({structureId:sid,kind:'residue',residues:rs});e.select(selection);
    return {value:{selection,radius,residueCount:rs.length},patch:{selection}};
  }
  if(action==='removeStructure'){
    const node=e.structureNode(sid);if(!node)throw failure('TARGET_NOT_FOUND','Structure not found');await e.plugin.state.data.build().delete(node.cell.transform.ref).commit();e.structures.delete(sid);e.residues.delete(sid);e.structureRefs.delete(sid);
    return {value:{removed:sid},patch:{removedStructures:[sid],selection:null,activeStructureId:state.structures.find(s=>s.structureId!==sid)?.structureId??null,tags:state.tags.filter(t=>t.selection.structureId!==sid),layers:state.layers.filter(t=>t.selection.structureId!==sid),measurements:state.measurements.filter(m=>!m.points.some(p=>p.structureId===sid))}};
  }
  throw failure('INVALID_ARGUMENT',`Unknown operation: ${action}`);
}
