import {failure} from '../shared/model.js';
export function videoEncoding(format='webm'){
 if(!['webm','mp4'].includes(format))throw failure('INVALID_ARGUMENT','Video format must be webm or mp4');
 const candidates=format==='mp4'?['video/mp4;codecs=avc1.42E01E','video/mp4']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
 const mime=candidates.find(type=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(type));
 if(!mime)throw failure('UNSUPPORTED_CAPABILITY',`No ${format.toUpperCase()} encoder is available in this DSH browser`);
 return {mime,format,container:'video/'+format};
}
// isTypeSupported can report a codec whose encoder is missing at runtime.
// Check real encoded frames before advertising MP4 in the capture UI.
export async function probeVideoEncoding(format){
 let stream,recorder,timer,timeout;
 try{
  const {mime,container}=videoEncoding(format),canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d');stream=canvas.captureStream(0);const track=stream.getVideoTracks()[0],chunks=[];
  recorder=new MediaRecorder(stream,{mimeType:mime});
  const done=new Promise(resolve=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=()=>resolve(chunks.length>0);recorder.onerror=()=>resolve(false);timeout=setTimeout(()=>resolve(false),1500);});
  let frame=0;const draw=()=>{context.fillStyle=frame++%2?'#59627d':'#263048';context.fillRect(0,0,128,128);track.requestFrame();};
  recorder.start(100);draw();timer=setInterval(draw,40);setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},400);
  if(!await done)return false;const bytes=new Uint8Array(await new Blob(chunks,{type:container}).arrayBuffer());
  return bytes.length>128;
 }catch{return false;}finally{clearInterval(timer);clearTimeout(timeout);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(track=>track.stop());}
}
