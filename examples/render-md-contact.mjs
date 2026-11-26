const stamp=Date.now();
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]||'.'),manifest=JSON.parse(await readFile(join(root,process.argv[3]||'MD-contact.json'),'utf8'));
const base=process.env.DSH_MOL_API||'http://127.0.0.1:43140/api/';
async function api(method,...args){const r=await(await fetch(base+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})).json();if(!r.ok)throw Error(r.error.message);return r.value;}
const tool=async(n,args)=>(await api('callTool','molecular_'+n,args)).result;
const command=(action,args)=>tool('control',{action,args});
await new Promise(r=>setTimeout(r,1500));
for(const s of (await api('getState')).structures)await command('removeStructure',{structureId:s.structureId});
const loaded=await api('callTool','molecular_load',{path:join(root,manifest.topology)}),sid=loaded.structureId;
const attached=await tool('trajectory',{structureId:sid,path:join(root,manifest.trajectory),atomOrderConfirmed:true});
await command('setDisplay',{structureId:sid,representations:['ball-and-stick'],color:'uniform',colorValue:'#a4a9b3',opacity:.38,sizeFactor:.07,quality:'low'});
for(const [which,color]of [['left','#c99436'],['right','#48a49d']]){
 const endpoint=manifest.contact[which];
 await command('createLayer',{structureId:sid,chainId:endpoint.chainId,start:endpoint.start,representation:'ball-and-stick',color:'uniform',colorValue:color,sizeFactor:.22,name:'Contact '+which});
 await command('createLayer',{structureId:sid,...endpoint,representation:'spacefill',color:'uniform',colorValue:which==='left'?'#4579b4':'#cd5a65',sizeFactor:.28,name:'Endpoint '+endpoint.atomName});
}
const points=[manifest.contact.left,manifest.contact.right].map(p=>({structureId:sid,...p}));
const initial=await command('createMeasurement',{type:'distance',name:'Tracked contact distance',points,colorValue:'#655b46'});
await command('camera',{mode:'view',...manifest.view});
const first=await command('exportImage',{width:1200,height:900,background:'white',format:'png',path:'review/md-contact-frame-0-'+stamp+'.png'});
const near=manifest.distanceAngstrom.perFrame.indexOf(manifest.distanceAngstrom.min);
await command('trajectory',{structureId:sid,mode:'frame',frame:near});
const actual=await command('getResidues',{structureId:sid,maxAtoms:200});
const atom=(p)=>actual.atoms.find(a=>a.authAsymId===p.chainId&&a.authSeqId===p.start&&a.authAtomId===p.atomName);
const a=atom(manifest.contact.left),b=atom(manifest.contact.right);
const nearDistance=Math.hypot(...a.position.map((v,i)=>v-b.position[i]));
if(Math.abs(nearDistance-manifest.distanceAngstrom.min)>.001)throw Error('Tracked frame distance does not match source coordinates');
const measured=(await api('getState')).measurements.find(m=>m.id===initial.id);if(Math.abs(measured.value-nearDistance)>.001)throw Error('Agent measurement metadata did not follow the frame');
const second=await command('exportImage',{width:1200,height:900,background:'white',format:'png',path:'review/md-contact-nearest-frame-'+stamp+'.png'});
await command('trajectory',{structureId:sid,mode:'frame',frame:0});
await command('trajectory',{structureId:sid,mode:'play',fps:12});
const video=await command('trajectory',{structureId:sid,mode:'video',seconds:5,fps:12,width:960,height:720,format:'webm',background:'white',path:'review/md-contact-'+stamp+'.webm'});
const start=performance.now(),paused=await command('trajectory',{structureId:sid,mode:'pause'});
const report={kind:'single-contact MD view',atomCount:attached.atomCount,frameCount:attached.frameCount,initialDistance:initial.value,nearFrame:near,nearDistance,pauseRoundTripMs:performance.now()-start,playbackStats:paused.playbackStats,images:[first.path,second.path],video:video.path};
await writeFile(join(root,'review','md-contact-render.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
