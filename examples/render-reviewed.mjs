import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
const root=resolve(process.argv[2]||'.'),choice=process.argv[3]||'antibody';
const base=process.env.DSH_MOL_API||'http://127.0.0.1:43140/api/';
async function api(method,...args){const r=await(await fetch(base+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})).json();if(!r.ok)throw Error(r.error.message);return r.value;}
const tool=async(n,args)=>(await api('callTool','molecular_'+n,args)).result;
const command=(action,args)=>tool('control',{action,args});
const load=async f=>{const sid=(await api('callTool','molecular_load',{path:isAbsolute(f)?f:join(root,f)})).structureId;await command('getStructureInfo',{structureId:sid});return sid;};
const sum=(a,b)=>a.map((v,i)=>v+b[i]),diff=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s),norm=a=>mul(a,1/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
await new Promise(r=>setTimeout(r,1500));
for(const s of (await api('getState')).structures)await command('removeStructure',{structureId:s.structureId});
const meta=JSON.parse(await readFile(join(root,'analysis.json'),'utf8')),images=[];
await mkdir(join(root,'review'),{recursive:true});
async function view(name,target,direction,up,radius){
 await command('camera',{mode:'view',target,direction,up,radius});
 if(choice!=='antibody')await command('camera',{mode:'clipping',radius:0,far:false,minNear:1,fog:name==='3jah-global-context'?15:0});
 const result=await command('exportImage',{width:choice==='antibody'?1400:1800,height:choice==='antibody'?1050:1500,format:'png',background:'white',path:'review/'+name+'-'+Date.now()+'.png'});
 images.push({name,path:result.path});console.log(name,result.path);
}
const sites=rs=>rs.map(r=>({authAsymId:r.chain,authSeqId:r.residue,insCode:r.insCode||''}));
if(choice==='antibody'){
 const a=meta.antibody,antigen=await load(a.files.antigen),heavy=await load(a.files.heavy),light=await load(a.files.light);
 for(const [sid,color]of [[antigen,'#668db5'],[heavy,'#a48aca'],[light,'#ddb974']])await command('setDisplay',{structureId:sid,representations:['cartoon'],color:'uniform',colorValue:color});
 for(const [sid,rs,c,n]of [[antigen,a.antigenInterface,'#249f9a','PD-L1 interface'],[heavy,a.heavyInterface,'#df776c','Heavy paratope'],[light,a.lightInterface,'#dda342','Light paratope']])if(rs.length)await tool('highlight',{structureId:sid,residues:sites(rs),persistent:true,colorValue:c,name:n});
 const axis=norm(diff(a.antibodyCenter,a.antigenCenter)),side=norm(cross(axis,[0,0,1])),up=norm(cross(side,axis));
 await view('pdl1-recognition',mul(sum(a.antibodyCenter,a.antigenCenter),.5),side,up,52);
 const field=await tool('surface',{structureId:antigen,color:'electrostatic',surface:'molecular',opacity:.82,limit:.65,name:'PD-L1 surface potential preview'});
 await command('setDisplay',{structureId:antigen,representations:[]});
 for(const sid of [heavy,light])await command('setDisplay',{structureId:sid,opacity:.68});
 for(const l of (await api('getState')).layers.filter(l=>/interface|paratope/i.test(l.name)))await command('setVisibility',{kind:'layer',id:l.id,visible:false});
 for(const p of a.chargedPairs.slice(0,3)){
  const sid=p.antibody.chain===a.chains.heavy?heavy:light;
  await tool('highlight',{structureId:sid,persistent:true,residues:sites([p.antibody]),colorValue:'#c64d68',name:'Charged interface '+p.antibody.residue});
  await command('createMeasurement',{type:'distance',points:[{structureId:antigen,chainId:p.antigen.chain,start:p.antigen.residue,atomName:p.antigen.atom},{structureId:sid,chainId:p.antibody.chain,start:p.antibody.residue,atomName:p.antibody.atom}],colorValue:'#516273'});
 }
  const chargeLayers=(await api('getState')).layers.filter(l=>l.name.startsWith('Charged interface'));
 for(const l of chargeLayers)await command('setDisplay',{layerId:l.id,representation:'ball-and-stick',sizeFactor:.28});
 await view('pdl1-electrostatic-recognition',mul(sum(a.antibodyCenter,a.antigenCenter),.5),side,up,52);
 await command('setVisibility',{kind:'layer',id:field.layerId,visible:false});
 await tool('surface',{structureId:antigen,color:'electrostatic',surface:'molecular',opacity:.52,limit:.65,name:'Soft full-antigen electrostatic surface'});
 const prs=[...new Map(a.chargedPairs.map(p=>[p.antigen.residue,p.antigen])).values()];
 const arg=await tool('highlight',{structureId:antigen,persistent:true,residues:sites(prs),colorValue:'#2f72ae',name:'PD-L1 positive arginines'});
 for(const l of (await api('getState')).layers.filter(l=>l.name==='PD-L1 positive arginines'))await command('setDisplay',{layerId:l.id,representation:'ball-and-stick',sizeFactor:.28});
 const point=a.chargedPairs[0],contactCenter=mul(sum(point.antigen.xyz,point.antibody.xyz),.5);
 await view('pdl1-charge-complementarity-detail',contactCenter,norm(sum(side,mul(axis,-.45))),up,15);
 await writeFile(join(root,'review','antibody-render.json'),JSON.stringify({images,field},null,2));
}else{
 const r=meta.ribosome,context=await load(r.files.fullContext||r.files.context);
 await command('setDisplay',{structureId:context,representations:['cartoon'],color:'uniform',colorValue:'#a8b6c8',opacity:.10,quality:'low'});
 for(const [k,c]of [['erf1','#df756d'],['pTrna','#e4b840'],['eTrna','#48b5ad'],['mrna','#9a86bd']]){
  const sid=await load(r.files[k]);await command('setDisplay',{structureId:sid,representations:['cartoon'],color:'uniform',colorValue:c,quality:'low'});
 }
 const pose=JSON.parse(await readFile(new URL('./3jah-camera.json',import.meta.url),'utf8'));
 await view('3jah-termination-sites',pose.sites.target,pose.direction,pose.up,pose.sites.radius);
 await view('3jah-global-context',pose.global.target,pose.direction,pose.up,pose.global.radius);
 await view('3jah-factor-trna-detail',pose.detail.target,pose.direction,pose.up,pose.detail.radius);
 await writeFile(join(root,'review','ribosome-render.json'),JSON.stringify({images,chains:r.chains},null,2));
}
