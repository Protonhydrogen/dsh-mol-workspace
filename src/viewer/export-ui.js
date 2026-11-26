import * as React from 'react';
import {probeVideoEncoding} from './video-codecs.js';
const h=React.createElement;
const SIZES=[['viewport','Viewport'],['1280x720','HD (1280×720)'],['1920x1080','Full HD (1920×1080)'],['3840x2160','Ultra HD (3840×2160)'],['7680x4320','8K Ultra HD (7680×4320)'],['custom','Custom…']];
export function ExportControls({active,selection,run,state,lastExport}){
 const [tab,setTab]=React.useState('image'),[size,setSize]=React.useState('1920x1080'),[density,setDensity]=React.useState('1'),[format,setFormat]=React.useState('png'),[background,setBackground]=React.useState('current'),[path,setPath]=React.useState(''),[custom,setCustom]=React.useState([1920,1080]);
 const [start,setStart]=React.useState(1),[end,setEnd]=React.useState(null),[fps,setFps]=React.useState(30),[videoSize,setVideoSize]=React.useState('1920x1080'),[videoFormat,setVideoFormat]=React.useState('webm');
 const [mp4,setMp4]=React.useState(null);
 React.useEffect(()=>{if(tab!=='video')return;let active=true;probeVideoEncoding('mp4').then(supported=>{if(active)setMp4(supported);});return()=>{active=false;};},[tab]);
 const preview=state.commands.filter(c=>c.action==='previewImage'&&c.status==='succeeded').at(-1)?.result;
 const dimensions=()=>{if(size==='viewport')return {viewport:true};const [w,v]=size==='custom'?custom:size.split('x').map(Number);return {width:w*Number(density),height:v*Number(density)};};
 const backgrounds=h('select',{'aria-label':'Capture background',value:background,onChange:e=>setBackground(e.target.value)},[['current','Current'],['white','White'],['black','Black'],...(tab==='image'&&format==='png'?[['transparent','Transparent']]:[])].map(([value,label])=>h('option',{key:value,value},label)));
 const row=(label,control)=>h('label',{className:'mw-capture-field'},h('span',null,label),control);
 const choice=(value,onChange,options,label)=>h('div',{className:'mw-segments',role:'group','aria-label':label},options.map(([key,text])=>h('button',{key,className:value===key?'active':'',onClick:()=>onChange(key)},text)));
 const record=()=>{const [width,height]=videoSize==='custom'?custom:videoSize.split('x').map(Number);run('trajectory',{mode:'video',format:videoFormat,background,fps:Number(fps),width,height,...(active.frameCount>1?{structureId:active.structureId,startFrame:Number(start)-1,endFrame:Number(end??active.frameCount)-1}:{seconds:5}),...(path?{path}:{})});};
 return h(React.Fragment,null,
  h('div',{className:'mw-capture-tabs'},h('button',{className:tab==='image'?'active':'',onClick:()=>setTab('image')},'▧ Image'),h('button',{className:tab==='video'?'active':'',onClick:()=>setTab('video')},'▣ Video')),
  tab==='image'?h(React.Fragment,null,
   preview&&h('img',{src:preview.dataUrl,alt:'Molecular image preview',className:'mw-capture-preview'}),
   row('Resolution',h('select',{'aria-label':'Image resolution',value:size,onChange:e=>setSize(e.target.value)},SIZES.map(([value,label])=>h('option',{key:value,value},label)))),
   size==='custom'&&row('Custom size',h('div',{className:'mw-row'},custom.map((value,i)=>h('input',{className:'mw-input',type:'number',key:i,'aria-label':i?'Image height':'Image width',value,min:128,max:8192,onChange:e=>setCustom(old=>old.map((v,j)=>j===i?Number(e.target.value):v))})))),
   row('Pixel density',h('select',{'aria-label':'Pixel density',value:density,onChange:e=>setDensity(e.target.value)},['1','2'].map(value=>h('option',{key:value,value},value+'×')))),
   row('Format',h('select',{'aria-label':'Image format',value:format,onChange:e=>{setFormat(e.target.value);if(e.target.value!=='png'&&background==='transparent')setBackground('current');}},h('option',{value:'png'},'PNG'),h('option',{value:'jpeg'},'JPEG'))),row('Background',backgrounds),
   h('div',{className:'mw-row'},h('button',{className:'mw-btn',disabled:!active,onClick:()=>run('previewImage',{format:'png',background,transparent:background==='transparent'})},'Preview'),h('button',{className:'mw-btn primary grow',disabled:!active,onClick:()=>run('exportImage',{...dimensions(),format,background,transparent:background==='transparent',...(path?{path}:{})})},'↓ Download '+format.toUpperCase())),
   h('button',{className:'mw-btn',disabled:!selection,onClick:()=>run('exportStructure',{...(path?{path}:{})})},'Export selection CIF')):
  h(React.Fragment,null,
   h('div',{className:'mw-kicker'},'TRAJECTORY'),h('div',{className:'mw-trajectory-source'},h('span',null,active?.title??'No structure'),h('small',null,(active?.frameCount??0)+' frames')),
   row('Resolution',choice(videoSize,setVideoSize,[['1920x1080','1080p'],['3840x2160','4K'],['custom','Custom']],'Video resolution')),
   videoSize==='custom'&&h('div',{className:'mw-row'},custom.map((value,i)=>h('input',{key:i,type:'number',className:'mw-input','aria-label':i?'Video height':'Video width',min:128,max:3840,value,onChange:e=>setCustom(old=>old.map((v,j)=>i===j?Number(e.target.value):v))}))),
   row('Frame rate',choice(fps,setFps,[[24,'24 fps'],[30,'30 fps'],[60,'60 fps']],'Video frame rate')),
   row('Frame range',h('div',{className:'mw-frame-range'},h('input',{className:'mw-input',type:'number','aria-label':'Video first frame',min:1,max:active?.frameCount??1,value:start,onChange:e=>setStart(e.target.value)}),h('span',null,'to'),h('input',{className:'mw-input',type:'number','aria-label':'Video last frame',min:1,max:active?.frameCount??1,value:end??active?.frameCount??1,onChange:e=>setEnd(e.target.value)}))),
   row('Background',backgrounds),row('Format',h('select',{'aria-label':'Video format',value:videoFormat,onChange:e=>setVideoFormat(e.target.value)},h('option',{value:'webm'},'WebM'),h('option',{value:'mp4',disabled:!mp4},mp4?'MP4':mp4===null?'MP4 · checking encoder…':'MP4 · encoder unavailable'))),
   h('button',{className:'mw-btn primary mw-capture-download',disabled:!active||typeof MediaRecorder==='undefined',onClick:record},'↓ Export '+videoFormat.toUpperCase()),
   h('p',{className:'mw-help'},active?.frameCount>1?'Render the selected frames, then restore the original frame.':'A single-frame structure records a 5-second view. Enable spin under View to capture motion.')),
  h('details',{className:'mw-settings-group'},h('summary',null,'OUTPUT'),h('input',{className:'mw-input','aria-label':'Export path',placeholder:'Optional path inside this workspace',value:path,onChange:e=>setPath(e.target.value)}),h('p',{className:'mw-help'},'Temporary highlights are removed for capture. Structure context and measurements are saved alongside the file as JSON. Resolution is limited by the GPU.')),
  lastExport&&h('div',{className:'mw-help',style:{overflowWrap:'anywhere'}},'Saved: '+lastExport.path,lastExport.evidencePath&&h('div',null,'Evidence: '+lastExport.evidencePath)));
}
