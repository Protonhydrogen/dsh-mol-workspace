import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

// Where per-session viewer state is restored from on the next launch.
// Override with DSH_MOLECULAR_STATE_DIR; otherwise it lives under the user
// profile, never inside the plugin directory and never on a hard-coded drive.
export const DEFAULT_STATE_DIR =
  process.env.DSH_MOLECULAR_STATE_DIR || join(homedir(), '.dsh', 'storages', 'molecular-workspace');

export class SessionPersistence {
  constructor(root = DEFAULT_STATE_DIR) {this.root=root;this.timers=new Map();}
  path(sessionId){return join(this.root,createHash('sha256').update(String(sessionId)).digest('hex')+'.json');}
  read(sessionId){try{return JSON.parse(readFileSync(this.path(sessionId),'utf8'));}catch(err){if(err.code!=='ENOENT')console.error('[molecular] state restore failed',err);return null;}}
  schedule(sessionId,state){clearTimeout(this.timers.get(sessionId));this.timers.set(sessionId,setTimeout(()=>{this.timers.delete(sessionId);this.write(sessionId,state);},300));}
  write(sessionId,state){try{mkdirSync(this.root,{recursive:true});const path=this.path(sessionId);writeFileSync(path+'.tmp',JSON.stringify(state.serialize()),'utf8');renameSync(path+'.tmp',path);}catch(err){console.error('[molecular] state save failed',err);}}
  flush(sessions){for(const [sid,s] of sessions){clearTimeout(this.timers.get(sid));this.write(sid,s);}this.timers.clear();}
}
