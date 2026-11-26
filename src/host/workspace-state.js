import {createHash} from 'node:crypto';
import { ACTIONS, clone, failure, id, requireObject } from '../shared/model.js';
import { normalizeSelection } from '../shared/selection.js';

const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fingerprint=(action,args)=>createHash('sha256').update(JSON.stringify(canonical({action,args}))).digest('hex');
const undoable=new Set(['setDisplay','renderSurface','setVisibility','createTag','removeTag','createLayer','removeLayer','createMeasurement','removeMeasurement','clearMeasurements','styleMeasurement','hideSelection']);
const terminal = new Set(['succeeded','failed','cancelled','timed_out']);
export class WorkspaceState {
  constructor({ now=Date.now, timeoutMs=30000, leaseMs=15000, onChange=()=>{} }={}) {
    this.now=now; this.timeoutMs=timeoutMs; this.leaseMs=leaseMs; this.onChange=onChange;
    this.revision=0; this.nextId=1; this.structures=new Map(); this.commands=new Map();this.commandHistory=new Map(); this.waiters=new Map(); this.listeners=new Set();
    this.viewer=null; this.selection=null; this.focus=null; this.highlight=null; this.activeStructureId=null;
    this.undoStack=[];this.hiddenSelections=[];this.tags=[]; this.layers=[]; this.measurements=[]; this.camera={}; this.trajectory={};
  }
  changed(persist=true) {
    this.revision++;
    for (const listener of [...this.listeners]) listener();
    if (persist) this.onChange(this);
  }
  connected() { return !!this.viewer && this.now()-this.viewer.lastSeen <= this.leaseMs; }
  heartbeat(viewerId, report={}) {
    if (typeof viewerId !== 'string' || !viewerId) throw failure('INVALID_ARGUMENT','viewerId is required');
    if (this.connected() && this.viewer.id !== viewerId) return { owner:false, viewerId:this.viewer.id };
    const changed=this.viewer?.id!==viewerId || !this.connected();
    if(changed)for(const c of this.commands.values())if(!terminal.has(c.status)&&c.viewerId!==viewerId)this.finish(c,'failed',null,{code:'VIEWER_NOT_CONNECTED',message:'The assigned viewer was closed or replaced'});
    this.viewer={id:viewerId,lastSeen:this.now(),capabilities:clone(report.capabilities??this.viewer?.capabilities??{})};
    const camera=report.camera;if(camera&&['position','target','up'].every(k=>Array.isArray(camera[k])&&camera[k].length===3&&camera[k].every(Number.isFinite))&&JSON.stringify(this.camera.snapshot)!==JSON.stringify(camera)){this.camera={...this.camera,snapshot:clone(camera)};this.changed();}
    const t=report.trajectory,ref=t&&this.structures.get(String(t.structureId))?.ref;
    if(t&&ref&&Number.isInteger(t.frame)&&t.frame>=0&&t.frame<(ref.frameCount??1)&&JSON.stringify(this.trajectory)!==JSON.stringify(t)){this.trajectory=clone(t);this.changed();}
    if (changed) this.changed(false);
    return {owner:true,viewerId};
  }
  addStructure(ref,data,hash) {
    const sid=String(ref.structureId??this.nextId++);
    this.structures.set(sid,{ref:{display:{representation:'auto',color:'chain-id',opacity:1,visible:true},...clone(ref),contentHash:hash??null,structureId:sid},data,hash});
    this.nextId=Math.max(this.nextId,Number(sid)+1||this.nextId);this.activeStructureId=sid;this.changed();return clone(this.structures.get(sid).ref);
  }
  getStructureData(sid) {
    const entry=this.structures.get(String(sid));
    if(!entry) throw failure('TARGET_NOT_FOUND',`Structure ${sid} is not loaded`);
    return {data:entry.data,format:entry.ref.format,title:entry.ref.title};
  }
  setSelection(input) { this.selection=normalizeSelection(input);this.focus=clone(this.selection);if(this.selection&&this.structures.has(this.selection.structureId))this.activeStructureId=this.selection.structureId;this.changed();return this.snapshot(); }
  patch(patch={}) {
    if(Object.hasOwn(patch,'selection')&&!Object.hasOwn(patch,'focus'))this.focus=clone(patch.selection);
    for(const key of ['selection','focus','highlight','activeStructureId','tags','layers','measurements','camera','trajectory','hiddenSelections']) {
      if(Object.hasOwn(patch,key)) this[key]=clone(patch[key]);
    }
    if(Array.isArray(patch.structureUpdates)) for(const update of patch.structureUpdates) {
      const entry=this.structures.get(String(update.structureId));
      if(entry) Object.assign(entry.ref,clone(update));
    }
    if(Array.isArray(patch.removedStructures)&&patch.removedStructures.length){
      for(const sid of patch.removedStructures)this.structures.delete(String(sid));
      this.undoStack=[];this.hiddenSelections=this.hiddenSelections.filter(s=>this.structures.has(s.structureId));
    }
    this.changed();
  }
  publishMetadata(viewerId, metadata) {
    if(!this.connected() || this.viewer.id!==viewerId) return;
    const updates=Array.isArray(metadata)?metadata:[metadata];
    const changed=updates.filter(m=>m && this.structures.has(String(m.structureId))).filter(m=>{
      const current=this.structures.get(String(m.structureId)).ref;
      return Object.entries(m).some(([k,v])=>JSON.stringify(current[k])!==JSON.stringify(v));
    });
    if(changed.length)this.patch({structureUpdates:changed});
  }
  enqueue(input) {
    requireObject(input);const action=input.action;
    if(!ACTIONS.includes(action))throw failure('INVALID_ARGUMENT',`Unknown action: ${action}`);
    const args=clone(requireObject(input.args??{}));const cid=input.id??id('cmd');
    if(this.commands.has(cid)) {
      const old=this.commands.get(cid);
      if(old.action!==action||JSON.stringify(old.args)!==JSON.stringify(args))throw failure('INVALID_ARGUMENT','Command ID already belongs to a different request');
      return clone(old);
    }
    if(this.commandHistory.has(cid)){const old=this.commandHistory.get(cid);if(old.fingerprint!==fingerprint(action,args))throw failure('INVALID_ARGUMENT','Command ID already belongs to a different request');return this.getCommand(cid);}
    if(input.expectedRevision!=null && input.expectedRevision!==this.revision)throw failure('VERSION_CONFLICT','Workspace changed; read state before retrying');
    if(!this.connected())throw failure('VIEWER_NOT_CONNECTED','Open the Molecular Workspace sidebar before executing this operation');
    const c={id:cid,action,args,status:'pending',createdAt:this.now(),deadline:this.now()+(['exportImage','renderSurface'].includes(action)?120000:action==='trajectory'&&args.mode==='video'?300000:this.timeoutMs),viewerId:this.viewer.id};
    this.commands.set(cid,c);
    // Keep a bounded history without removing in-flight work.
    const completed=[...this.commands.values()].filter(c=>terminal.has(c.status));
    for(const old of completed.slice(0,Math.max(0,completed.length-30)))this.commands.delete(old.id);
    this.changed();return clone(c);
  }
  getCommand(cid) {this.expire();const c=this.commands.get(cid)??this.commandHistory.get(cid);if(!c)throw failure('TARGET_NOT_FOUND',`Command ${cid} not found`);const {fingerprint,...record}=c;return clone(record);}
  claim(viewerId,cid) {
    const c=this.commands.get(cid);
    if(!c||c.status!=='pending'||!this.connected()||this.viewer.id!==viewerId||c.viewerId!==viewerId)return null;
    if(this.now()>c.deadline){this.finish(c,'timed_out',null,{code:'TIMED_OUT',message:'Renderer did not execute the command in time'});return null;}
    c.status='running';this.changed(false);return clone(c);
  }
  complete(viewerId, report) {
    const c=this.commands.get(report.id);
    if(!c)throw failure('TARGET_NOT_FOUND','Unknown command');
    if(c.viewerId!==viewerId)throw failure('INVALID_ARGUMENT','Only the assigned renderer can acknowledge this command');
    if(terminal.has(c.status))return this.getCommand(c.id);
    if(c.status!=='running')throw failure('INVALID_ARGUMENT','Claim the command before acknowledging it');
    if(this.now()>c.deadline){this.finish(c,'timed_out',null,{code:'TIMED_OUT',message:'Renderer acknowledgement arrived after the deadline'});return this.getCommand(c.id);}
    if(!this.connected()||this.viewer.id!==viewerId)throw failure('VIEWER_NOT_CONNECTED','Renderer lease expired');
    if(report.ok){if(c.action==='undo')this.undoStack.pop();else if(undoable.has(c.action)){this.undoStack.push(this.undoFrame());this.undoStack=this.undoStack.slice(-20);}else if(c.action==='trajectory'&&['frame','step','play'].includes(c.args.mode))this.undoStack=[];this.patch(report.patch??{});this.finish(c,'succeeded',clone(report.value??null));}
    else this.finish(c,'failed',null,{code:report.error?.code??'EXECUTION_FAILED',message:String(report.error?.message??'Renderer operation failed')});
    return this.getCommand(c.id);
  }
  finish(c,status,result=null,error=null) {
    c.status=status;c.finishedAt=this.now();c.result=result;c.error=error;
    const retained=JSON.stringify(result??null).length<=8192;this.commandHistory.set(c.id,{id:c.id,action:c.action,fingerprint:fingerprint(c.action,c.args),status,createdAt:c.createdAt,finishedAt:c.finishedAt,result:retained?clone(result):null,resultUnavailable:!retained,error:clone(error),archived:true});
    const waiter=this.waiters.get(c.id);if(waiter){this.waiters.delete(c.id);waiter.settle(c);}
    this.changed();
  }
  wait(cid, signal) {
    const c=this.commands.get(cid)??this.commandHistory.get(cid);if(!c)return Promise.reject(failure('TARGET_NOT_FOUND','Unknown command'));
    const unpack=c=>{if(c.status==='succeeded')return c.resultUnavailable?{commandId:c.id,status:c.status,archived:true,resultUnavailable:true}:c.result;throw failure(c.error?.code??'EXECUTION_FAILED',c.error?.message??c.status);};
    if(terminal.has(c.status)){try{return Promise.resolve(unpack(c));}catch(e){return Promise.reject(e);}}
    // A single shared promise is used for retries with the same command ID.
    if(this.waiters.has(cid))return this.waiters.get(cid).promise;
    let settle;const promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.finish(c,'timed_out',null,{code:'TIMED_OUT',message:'Renderer acknowledgement timed out'}),Math.max(1,c.deadline-this.now()));
      const cancel=()=>this.finish(c,'cancelled',null,{code:'CANCELLED',message:'Operation cancelled'});
      settle=record=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);try{resolve(unpack(record));}catch(e){reject(e);}};
      signal?.addEventListener('abort',cancel,{once:true});
      if(signal?.aborted)queueMicrotask(cancel);
    });
    this.waiters.set(cid,{promise,settle});return promise;
  }
  expire(){for(const c of this.commands.values())if(!terminal.has(c.status)&&this.now()>c.deadline)this.finish(c,'timed_out',null,{code:'TIMED_OUT',message:'Renderer acknowledgement timed out'});}
  undoFrame(){return clone({selection:this.selection,focus:this.focus,highlight:this.highlight,activeStructureId:this.activeStructureId,tags:this.tags,layers:this.layers,measurements:this.measurements,hiddenSelections:this.hiddenSelections,structureUpdates:[...this.structures.values()].map(e=>({structureId:e.ref.structureId,display:e.ref.display}))});}
  snapshot() {
    this.expire();
    return clone({schemaVersion:1,undo:this.undoStack.at(-1)??null,hiddenSelections:this.hiddenSelections,workspaceId:this.workspaceId??null,revision:this.revision,structures:[...this.structures.values()].map(e=>e.ref),selection:this.selection,focus:this.focus,highlight:this.highlight,activeStructureId:this.activeStructureId,tags:this.tags,layers:this.layers,measurements:this.measurements,camera:this.camera,trajectory:this.trajectory,viewer:{connected:this.connected(),id:this.viewer?.id??null,capabilities:this.viewer?.capabilities??{}},commands:[...this.commands.values()]});
  }
  serialize() {return {...this.snapshot(),nextId:this.nextId,commandHistory:[...this.commandHistory.values()],undoStack:this.undoStack,records:[...this.structures.values()].map(clone)};}
  static restore(saved,options={}) {
    const s=new WorkspaceState(options);if(saved?.schemaVersion!==1)return s;
    s.structures=new Map((saved.records??[]).map(e=>[String(e.ref.structureId),clone(e)]));s.workspaceId=saved.workspaceId??null;s.nextId=saved.nextId??1;s.revision=saved.revision??0;
    for(const key of ['selection','focus','highlight','activeStructureId','tags','layers','measurements','camera','trajectory','hiddenSelections'])if(Object.hasOwn(saved,key))s[key]=clone(saved[key]);
    s.undoStack=clone(saved.undoStack??[]);if(s.trajectory)s.trajectory.playing=false;
    for(const h of saved.commandHistory??[])s.commandHistory.set(h.id,clone(h));
    for(const c of saved.commands??[])s.commands.set(c.id,terminal.has(c.status)?clone(c):{...clone(c),status:'failed',error:{code:'EXECUTION_FAILED',message:'Application restarted before this command completed'}});
    return s;
  }
}
