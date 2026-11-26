// This listener belongs to the plugin root, so it also runs while the viewer tab is closed.
export function installViewerWake(molecular, sidebar, {intervalMs=500,onError=console.error}={}) {
  let disposed=false,busy=false;
  const tick=async()=>{
    if(disposed||busy)return;busy=true;
    try {
      const response=await molecular.getViewerRequests();
      if(!response?.ok)throw new Error(response?.error?.message??'Cannot read viewer open requests');
      const sessionId=sidebar.mounted.getSnapshot();
      for(const request of response.value){
        if(disposed||request.sessionId!==sessionId)continue;
        sidebar.openTab('molecular',{revealIfOpened:true});
        if(!sidebar.isExpanded())sidebar.toggleExpanded();
        const result=await molecular.acknowledgeViewerRequest(sessionId,request.id);
        if(!result?.ok)throw new Error(result?.error?.message??'Cannot acknowledge viewer request');
      }
    }catch(error){if(!disposed)onError('[molstar] Viewer auto-open failed',error);}
    finally{busy=false;}
  };
  tick();const timer=setInterval(tick,intervalMs);
  return ()=>{disposed=true;clearInterval(timer);};
}
