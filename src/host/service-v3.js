import { basename, dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TypertRemoteService, RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { formatSelectionForChat, normalizeSelection } from '../shared/selection.js';
import { remoteDescriptors, REMOTE_METHODS } from '../shared/remote-manifest.js';
import { captureContext, contextText } from '../shared/citations.js';
import { failure, clone, id } from '../shared/model.js';
import { WorkspaceState } from './workspace-state.js';
import { SessionPersistence } from './persistence.js';
const hash=data=>createHash('sha256').update(data).digest('hex');
const formatOf=path=>/\.(cif|mmcif)$/i.test(path)?'mmcif':/\.(pdb|ent)$/i.test(path)?'pdb':'auto';
export class MolecularContextService extends TypertRemoteService {
  _sessions=new Map();
  constructor(ctx,key='molecular'){super(ctx,key);this._persistence=new SessionPersistence();this._validated=new Set();}
  _state(sessionId){
    if(typeof sessionId!=='string'||!sessionId)throw failure('INVALID_ARGUMENT','sessionId is required');
    if(!this._sessions.has(sessionId)){
      const saved=this._persistence.read(sessionId);
      const state=WorkspaceState.restore(saved,{onChange:s=>this._persistence.schedule(sessionId,s)});state.workspaceId=sessionId;this._sessions.set(sessionId,state);
    }
    return this._sessions.get(sessionId);
  }
  _cwd(sessionId){return this.ctx.agents?.get(sessionId)?.session?.header?.cwd;}
  _requestViewer(sessionId){
    this._viewerRequests??=new Map();
    const old=this._viewerRequests.get(sessionId);
    if(old&&old.expiresAt>Date.now())return old;
    const request={sessionId,id:id('open-viewer'),expiresAt:Date.now()+15000};
    this._viewerRequests.set(sessionId,request);return request;
  }
  async getViewerRequests(){
    this._viewerRequests??=new Map();
    for(const [sessionId,request] of this._viewerRequests)if(request.expiresAt<=Date.now())this._viewerRequests.delete(sessionId);
    return [...this._viewerRequests.values()].map(clone);
  }
  async acknowledgeViewerRequest(sessionId,requestId){
    if(this._viewerRequests?.get(sessionId)?.id===requestId)this._viewerRequests.delete(sessionId);
    return {ok:true};
  }
  async _ensureViewer(sessionId,signal){
    const state=this._state(sessionId);this._requestViewer(sessionId);
    if(state.connected())return;
    await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);state.listeners.delete(check);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
      const check=()=>{if(state.connected())finish();};
      const abort=()=>finish(failure('CANCELLED','Opening Mol* Viewer was cancelled'));
      const timer=setTimeout(()=>finish(failure('VIEWER_NOT_CONNECTED','Mol* Viewer could not open for this conversation. Keep the DSH conversation visible and retry.')),12000);
      state.listeners.add(check);signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();else check();
    });
  }
  async load(sessionId,path,signal){
    if(typeof path!=='string'||!path.trim())throw failure('INVALID_ARGUMENT','Path or PDB ID is required');
    const s=this._state(sessionId);let data,title,source;
    if(/^[0-9][A-Za-z0-9]{3}$/.test(path.trim())){
      const pdb=path.trim().toUpperCase(),url=`https://files.rcsb.org/download/${pdb}.cif`;
      const response=await fetch(url,{signal:AbortSignal.any([signal??new AbortController().signal,AbortSignal.timeout(30000)])});
      if(!response.ok)throw failure('TARGET_NOT_FOUND',`PDB ${pdb}: HTTP ${response.status}`);
      data=await response.text();title=`${pdb}.cif`;source={pdbId:pdb,url};
    }else{
      const target=await this.ctx.fs.resolve(path,{cwd:this._cwd(sessionId),signal});
      const stat=await this.ctx.fs.stat(target,signal);if(stat?.type!=='file')throw failure('TARGET_NOT_FOUND',`Not a structure file: ${path}`);
      data=await this.ctx.fs.readText(target,signal);title=basename(String(path).replace(/\\/g,'/'));source={path,displayPath:target.displayPath};
    }
    if(!data.trim())throw failure('INVALID_ARGUMENT','Structure file is empty');
    const format=formatOf(title);if(format==='auto')throw failure('INVALID_ARGUMENT','Use an uncompressed PDB or mmCIF file');
    const ref=s.addStructure({title,format,source,byteLength:Buffer.byteLength(data)},data,hash(data));
    this._requestViewer(sessionId);
    return {...ref};
  }
  async getStructureData(sessionId,structureId){return this._state(sessionId).getStructureData(structureId);}
  async getState(sessionId){
    const s=this._state(sessionId);
    if(!this._validated.has(sessionId)){
      this._validated.add(sessionId);
      for(const entry of s.structures.values())if(entry.ref.source?.path){
        try{
          const target=await this.ctx.fs.resolve(entry.ref.source.path,{cwd:this._cwd(sessionId)});const current=await this.ctx.fs.readText(target);
          if(entry.hash&&hash(current)!==entry.hash)entry.ref.warning='The source file changed. This is the saved structure; reload to update it.';
        }catch{entry.ref.warning='The source file is unavailable. Displaying the saved structure.';}
      }
    }
    return s.snapshot();
  }
  async setSelection(sessionId,selection){return this._state(sessionId).setSelection(selection);}
  async updateViewer(sessionId,viewerId,report){return this._state(sessionId).heartbeat(viewerId,report);}
  async releaseViewer(sessionId,viewerId){const state=this._state(sessionId);if(state.viewer?.id===viewerId){state.viewer=null;state.changed(false);}return {ok:true};}
  async publishMetadata(sessionId,viewerId,metadata){const s=this._state(sessionId);s.publishMetadata(viewerId,metadata);return s.snapshot();}
  async enqueueCommand(sessionId,input){await this._ensureViewer(sessionId);return this._state(sessionId).enqueue(input);}
  async claimCommand(sessionId,viewerId,commandId){return this._state(sessionId).claim(viewerId,commandId);}
  async completeCommand(sessionId,viewerId,report){
    const s=this._state(sessionId),command=s.getCommand(report.id);
    // Verify ownership and lifecycle before accepting an export payload.
    if(command.viewerId!==viewerId)throw failure('INVALID_ARGUMENT','Renderer does not own this command');
    if(command.status!=='running'){if(command.status==='pending')throw failure('INVALID_ARGUMENT','Claim the command first');return command;}
    if(!s.connected()||s.viewer.id!==viewerId||s.now()>command.deadline)return s.complete(viewerId,report);
    if(report.ok&&(['exportImage','exportStructure'].includes(command.action)||command.action==='trajectory'&&command.args.mode==='video')&&(report.value?.dataUrl||report.value?.text!=null)){
      try{report={...report,value:await this._saveArtifact(sessionId,report.value)};}
      catch(err){report={id:report.id,ok:false,error:{code:err.code??'EXECUTION_FAILED',message:err.message}};}
    }
    return s.complete(viewerId,report);
  }
  async getCommand(sessionId,commandId){return this._state(sessionId).getCommand(commandId);}
  async executeCommand(sessionId,input,signal){await this._ensureViewer(sessionId,signal);const s=this._state(sessionId);const c=s.enqueue(input);return s.wait(c.id,signal);}
  async select(sessionId,selection){await this.executeCommand(sessionId,{action:'select',args:{selection}},undefined);return this.getState(sessionId);}
  async focus(sessionId,selection){await this.executeCommand(sessionId,{action:'focus',args:{selection}},undefined);return this.getState(sessionId);}
  async highlight(sessionId,selection){await this.executeCommand(sessionId,{action:'highlight',args:{selection}},undefined);return this.getState(sessionId);}
  async setDisplay(sessionId,structureId,patch){await this.executeCommand(sessionId,{action:'setDisplay',args:{...patch,structureId}},undefined);return this.getState(sessionId);}
  async addToChat(sessionId,selection){
    const s=this._state(sessionId);const chosen=normalizeSelection(selection??s.selection??(s.activeStructureId?{structureId:s.activeStructureId,kind:'chain',chainIds:(s.structures.get(s.activeStructureId)?.ref.chains??[]).map(c=>c.chainId)}:null));if(!chosen)throw failure('INVALID_ARGUMENT','Load a structure first');
    const context=captureContext(s.snapshot(),{structureId:chosen.structureId,selection:chosen});s.setSelection(chosen);return {ok:true,delivery:'captured',selection:chosen,context};
  }
  _inject(sessionId,text,action){const agent=this.ctx.agents?.get(sessionId);if(!agent)throw failure('TARGET_NOT_FOUND','No live agent for this session');agent.inject(createUserMessage({content:[{type:'text',text}],source:{kind:'molecular-workspace',action}}));}
  async addNote(sessionId,text){if(typeof text!=='string'||!text.trim())throw failure('INVALID_ARGUMENT','Note is empty');this._inject(sessionId,text,'note');return {ok:true};}
  async _saveArtifact(sessionId,value){
    const cwd=this._cwd(sessionId);if(!cwd)throw failure('INVALID_ARGUMENT','Open a project session before exporting a file');
    const filename=basename(value.filename??'molecular-export');
    const output=resolve(cwd,value.path||join('molecular-exports',`${Date.now()}-${filename}`));const rel=relative(resolve(cwd),output);
    if(rel.startsWith('..')||isAbsolute(rel))throw failure('INVALID_ARGUMENT','Export path must remain inside the session workspace');
    let buffer;
    if(value.dataUrl){const match=/^data:(image\/(?:png|jpeg)|video\/(?:webm|mp4));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value.dataUrl);if(!match)throw failure('INVALID_ARGUMENT','Unsupported export encoding');buffer=Buffer.from(match[2],'base64');}
    else buffer=Buffer.from(value.text,'utf8');
    await mkdir(dirname(output),{recursive:true});await writeFile(output,buffer,{flag:'wx'});
    const {dataUrl,text,evidence,...metadata}=value;let evidencePath;
    if(evidence){evidencePath=output+'.json';await writeFile(evidencePath,JSON.stringify({...evidence,artifact:{path:output,byteLength:buffer.length,format:value.format}},null,2),{flag:'wx'});}
    return {...metadata,path:output,byteLength:buffer.length,...(evidencePath?{evidencePath}:{})};
  }
  async *followState(sessionId,signal){
    const s=this._state(sessionId);while(!signal?.aborted){const rev=s.revision;yield s.snapshot();await new Promise(resolve=>{let timer;const wake=()=>{clearTimeout(timer);s.listeners.delete(wake);signal?.removeEventListener('abort',wake);resolve();};s.listeners.add(wake);signal?.addEventListener('abort',wake,{once:true});timer=setTimeout(wake,1500);if(s.revision!==rev)wake();});}
  }
  flushPersistence(){this._persistence.flush(this._sessions);}
}
Object.defineProperty(MolecularContextService.prototype,'@deepseek-ai/dsh-typert-protocol/remote-methods',{configurable:true,value:Object.freeze({version:1,methods:Object.entries(REMOTE_METHODS).map(([method])=>({method,invocation:{kind:'direct'},...(method==='followState'?{mode:'stream'}:{})}))})});
const codec=type=>({mode:'strict',typeSymbol:type==='string'?'string':'unknown',create:()=>type==='string'?z.string():z.unknown()});
export const MOLECULAR_TYPERT={package:'dsh-mol-workspace',face:'host',schemas:[],invocations:remoteDescriptors(codec),model:{services:[{key:'molecular',exportName:'MolecularContextService',description:'Molecular Workspace host service',summary:'Structure context and renderer commands',jsDoc:'',tags:[],members:Object.entries(REMOTE_METHODS).map(([method,params])=>({kind:'method',name:method,signature:`${method}(${params.map(([name,type])=>`${name}: ${type==='string'?'string':'unknown'}`).join(', ')}): Promise<unknown>`})),types:[]}],events:[],objects:[]}};
