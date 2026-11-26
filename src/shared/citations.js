import {clone} from './model.js';
export function captureContext(state,{structureId=state.selection?.structureId??state.activeStructureId,selection=state.selection,measurementId,tagId}={}){
 const structure=state.structures.find(s=>s.structureId===structureId);if(!structure)throw new Error('Structure is not loaded');
 const measurement=measurementId?state.measurements.find(m=>m.id===measurementId):null;
 const tag=tagId?[...state.tags,...state.layers].find(t=>t.id===tagId):null;
 return clone({kind:'molecular-context',schemaVersion:1,workspaceId:state.workspaceId,capturedRevision:state.revision,capturedAt:Date.now(),structure,trajectory:state.trajectory?.structureId===structureId?{...state.trajectory,frameIndexBase:0}:null,selection:tag?.selection??(selection?.structureId===structureId?selection:null),tags:state.tags.filter(t=>t.selection.structureId===structureId),layers:state.layers.filter(t=>t.selection.structureId===structureId),measurements:measurement?[measurement]:state.measurements.filter(m=>m.points.some(p=>p.structureId===structureId))});
}
export const contextText=context=>'[Molecular context — captured structured evidence]\n'+JSON.stringify(context,null,2);
