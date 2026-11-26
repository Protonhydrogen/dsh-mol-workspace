import {frameCaption} from '../shared/citation-frame.js';
import {captureContext,contextText} from '../shared/citations.js';
export function molecularReferenceSource(molecular,sidebarRight){
 return {trigger:'@',name:'molecular',showGroupTitle:true,
  async candidates(session,{query,signal}){
   const result=await molecular.getState(session.sessionId);if(!result.ok)throw new Error(result.error?.message??'Cannot read Molecular Workspace');if(signal?.aborted)return[];
   const state=result.value,rows=[];
   const add=(name,description,options)=>{if(query&&!`${name} ${description} molecular`.toLowerCase().includes(query.toLowerCase()))return;const context=captureContext(state,options);rows.push({name,description:description+frameCaption(context),icon:'file',section:'Molecular Workspace',value:JSON.stringify({label:name,context})});};
   for(const s of state.structures)add(s.title,`Structure ${s.structureId} · ${s.residueCount??'?'} residues`,{structureId:s.structureId,selection:null});
   if(state.selection)add('Current molecular selection',`Structure ${state.selection.structureId} · ${state.selection.kind}`,{structureId:state.selection.structureId});
   for(const tag of state.tags)add(tag.name,'Molecular tag',{structureId:tag.selection.structureId,tagId:tag.id});
   for(const m of state.measurements)add(`${m.name}${m.value!=null?' '+Number(m.value).toFixed(2)+' '+m.unit:''}`,'Molecular measurement',{structureId:m.points[0]?.structureId,measurementId:m.id});
   return rows;
  },
  onPick({candidate}){const value=JSON.parse(candidate.value);return {insert:{source:'molecular',ref:JSON.stringify(value.context),label:value.label,appearance:'file',clipboardText:contextText(value.context)}};},
  openReference(){sidebarRight.openTab('molecular');return true;},
  codec:{clipboardText:ref=>contextText(JSON.parse(ref)),serialize:ref=>Promise.resolve(contextText(JSON.parse(ref)))},
 };
}
