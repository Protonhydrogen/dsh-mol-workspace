import {failure,id} from './model.js';
export async function pauseForCitation(adapter,structureId,{timeoutMs=15000,pollMs=100}={}){
 const queued=await adapter.enqueueCommand({id:id('capture-pause'),action:'trajectory',args:{structureId,mode:'pause'}});
 const deadline=Date.now()+timeoutMs;
 for(;;){
  const command=await adapter.getCommand(queued.id);
  if(command.status==='succeeded')return command.result;
  if(!['pending','running'].includes(command.status))throw failure(command.error?.code??'EXECUTION_FAILED',command.error?.message??'Could not pause the trajectory for capture');
  if(Date.now()>=deadline)throw failure('TIMED_OUT','The viewer did not acknowledge pause; no molecular reference was added');
  await new Promise(resolve=>setTimeout(resolve,pollMs));
 }
}
export function frameCaption(context){
 const tr=context.trajectory;
 return tr&&tr.frameCount>1&&Number.isInteger(tr.frame)?' · frame '+(tr.frame+1)+'/'+tr.frameCount:'';
}
