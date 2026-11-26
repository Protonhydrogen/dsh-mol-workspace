import test from 'node:test';
import assert from 'node:assert/strict';
import {MolecularContextService} from '../src/host/service-v3.js';
import {WorkspaceState} from '../src/host/workspace-state.js';
import {installViewerWake} from '../src/client/viewer-wake.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('a visual command opens the closed native tab before it is enqueued',async()=>{
 const service=Object.create(MolecularContextService.prototype),state=new WorkspaceState();service._state=()=>state;
 let opened=0,expanded=false;const sidebar={mounted:{getSnapshot:()=> 'current'},openTab:kind=>{assert.equal(kind,'molecular');opened++;state.heartbeat('mounted-viewer');},isExpanded:()=>expanded,toggleExpanded:()=>expanded=!expanded};
 const remote={getViewerRequests:async()=>({ok:true,value:await service.getViewerRequests()}),acknowledgeViewerRequest:async(...args)=>({ok:true,value:await service.acknowledgeViewerRequest(...args)})};
 const dispose=installViewerWake(remote,sidebar,{intervalMs:5,onError:(...args)=>assert.fail(String(args))});
 try{const queued=await service.enqueueCommand('current',{action:'camera',args:{mode:'reset'}});assert.equal(queued.status,'pending');assert.equal(opened,1);assert.equal(expanded,true);await wait(10);assert.equal((await service.getViewerRequests()).length,0);}finally{dispose();}
});
test('viewer requests do not navigate a different active conversation',async()=>{
 const service=Object.create(MolecularContextService.prototype);service._requestViewer('background');let opens=0;
 const dispose=installViewerWake({getViewerRequests:async()=>({ok:true,value:await service.getViewerRequests()})},{mounted:{getSnapshot:()=> 'current'},openTab:()=>opens++},{intervalMs:5});
 await wait(20);dispose();assert.equal(opens,0);assert.equal((await service.getViewerRequests()).length,1);
});
test('closing a renderer releases its lease without releasing a newer owner',async()=>{
 const service=Object.create(MolecularContextService.prototype),state=new WorkspaceState();service._state=()=>state;state.heartbeat('old');await service.releaseViewer('s','different');assert.equal(state.connected(),true);await service.releaseViewer('s','old');assert.equal(state.connected(),false);
 const abort=new AbortController();const pending=service._ensureViewer('s',abort.signal);abort.abort();await assert.rejects(pending,e=>e.code==='CANCELLED');
});
