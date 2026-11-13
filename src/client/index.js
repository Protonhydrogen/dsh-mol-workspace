import {installViewerWake} from './viewer-wake.js';
import {insertMolecularCitation,selectionCitationLabel} from './composer.js';
import * as React from 'react';
import { molecularReferenceSource } from './references.js';
import { Workspace } from '../viewer/workspace.js';
import { styles } from '../viewer/styles.js';
import { remoteDescriptors, REMOTE_METHODS } from '../shared/remote-manifest.js';
const NS='molecularWorkspace',ID='dsh-mol-workspace';
export const inject=['slots','locale','sidebarRightTabs','sidebarRight','remote','theme','inputTriggers','sessions','conversation'];
const unwrap=r=>{if(r?.ok===true)return r.value;throw new Error(r?.error?.message??String(r?.error??'Molecular remote call failed'));};
const codec=type=>({mode:'strict',typeSymbol:type==='string'?'string':'unknown',create:()=>({parse:v=>v})});
const manifest={package:ID,descriptors:remoteDescriptors(codec)};
function createFace(molecular,ctx){return sessionId=>({adapter:{getTheme:()=>ctx.get('theme').getTheme(),subscribeTheme:fn=>ctx.on('theme/change',fn),...Object.fromEntries(Object.keys(REMOTE_METHODS).filter(m=>!['followState','getViewerRequests'].includes(m)).map(method=>[method,async(...args)=>{
  if(method==='load'||method==='getStructureData')args.push(new AbortController().signal);
  return unwrap(await molecular[method](sessionId,...args));
}])),addToChat:async selection=>{const result=unwrap(await molecular.addToChat(sessionId,selection));return insertMolecularCitation(ctx,sessionId,result.context,selectionCitationLabel(result.context));},addNote:async text=>{const state=unwrap(await molecular.getState(sessionId));return insertMolecularCitation(ctx,sessionId,{kind:'molecular-note',workspaceId:sessionId,capturedRevision:state.revision,text},'Molecular measurement');}}});}
function Title(){return React.createElement(React.Fragment,null,'Mol* Viewer');}
export async function apply(ctx){
  await ctx.remote.$mount(manifest);const molecular=ctx.get('remote.molecular');if(!molecular)throw new Error('Molecular remote namespace did not mount');
  ctx.effect(()=>installViewerWake(molecular,ctx.get('sidebarRight')),'molstar: auto-open viewer');
  ctx.effect(()=>ctx.locale.register(NS,{zh:{title:'Mol* Viewer',description:'Explore, measure, style and export molecular structures'},en:{title:'Mol* Viewer',description:'Explore, measure, style and export molecular structures'}}),'molecular: locale');
  const t=ctx.locale.bind(NS);
  ctx.effect(()=>ctx.get('inputTriggers').registerSource(molecularReferenceSource(molecular,ctx.get('sidebarRight'))),'molecular: composer references');
  ctx.effect(()=>ctx.sidebarRightTabs.register({id:ID,kind:'molecular',priority:'builtin',title:()=>t('title'),guide:[{id:'molecular',order:100,title:()=>t('title'),description:()=>t('description')}]}),'molecular: type');
  ctx.effect(()=>{const tag=document.createElement('style');tag.dataset.pluginCss=ID;tag.textContent=styles;document.head.appendChild(tag);return()=>tag.remove();},'molecular: styles');
  ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:ID,locale:NS,inject:createFace(molecular,ctx)},Workspace)),'molecular: body');
  ctx.effect(()=>ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:ID},Title)),'molecular: title');
}
