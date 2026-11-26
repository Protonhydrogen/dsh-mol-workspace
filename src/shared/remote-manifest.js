export const REMOTE_METHODS = {
  getViewerRequests:[],acknowledgeViewerRequest:[['sessionId','string'],['requestId','string']],releaseViewer:[['sessionId','string'],['viewerId','string']],
  load:[['sessionId','string'],['path','string']],getStructureData:[['sessionId','string'],['structureId','string']],getState:[['sessionId','string']],
  getTrajectoryData:[['sessionId','string'],['structureId','string'],['path','string']],
  getPotentialGrid:[['sessionId','string'],['path','string']],
  select:[['sessionId','string'],['selection','json']],focus:[['sessionId','string'],['selection','json']],highlight:[['sessionId','string'],['selection','json']],
  setDisplay:[['sessionId','string'],['structureId','string'],['patch','json']],
  addToChat:[['sessionId','string'],['selection','json']],addNote:[['sessionId','string'],['text','string']],
  updateViewer:[['sessionId','string'],['viewerId','string'],['report','json']],
  publishMetadata:[['sessionId','string'],['viewerId','string'],['metadata','json']],
  setSelection:[['sessionId','string'],['selection','json']],
  enqueueCommand:[['sessionId','string'],['input','json']],
  claimCommand:[['sessionId','string'],['viewerId','string'],['commandId','string']],
  completeCommand:[['sessionId','string'],['viewerId','string'],['report','json']],
  getCommand:[['sessionId','string'],['commandId','string']],
  followState:[['sessionId','string']],
};
export function remoteDescriptors(codec){
  return Object.entries(REMOTE_METHODS).map(([method,params])=>({id:`dsh-mol-workspace#molecular/${method}`,service:'molecular',namespace:'molecular',method,invocation:{kind:'direct'},...(method==='followState'?{mode:'stream',cancellation:{parameter:'signal'}}:method==='load'||method==='getStructureData'?{cancellation:{parameter:'signal'}}:{}),parameters:params.map(([name,type])=>({name,wire:name,source:'json',codec:codec(type)})),result:codec('json')}));
}
