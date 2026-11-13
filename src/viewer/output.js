import { AlignSequences } from 'molstar/lib/mol-model/sequence/alignment/sequence';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { to_mmCIF } from 'molstar/lib/mol-model/structure/export/mmcif';
import { alignAndSuperpose } from 'molstar/lib/mol-model/structure/structure/util/superposition';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { extractResidues, residuesFromLoci } from './selection.js';
import { chainsOf } from './targets.js';
import { clone, failure } from '../shared/model.js';
import {videoEncoding} from './video-codecs.js';

function evidence(e,state){return {schemaVersion:1,workspaceId:state.workspaceId,revision:state.revision,structures:state.structures,selection:state.selection,tags:state.tags,layers:state.layers,measurements:state.measurements,camera:e.plugin.canvas3d.camera.getSnapshot(),trajectory:state.trajectory};}
export async function exportImage(e,a,state){
  const helper=e.plugin.helpers.viewportScreenshot;
  if(!helper)throw failure('UNSUPPORTED_CAPABILITY','Image capture is not available');
  const viewport=e.plugin.canvas3d.getCanvas?.()??e.plugin.canvas3d.webgl.gl.canvas;
  const width=Number(a.viewport?viewport.width:a.width??1920),height=Number(a.viewport?viewport.height:a.height??1080),format=a.format??'png';
  const gl=e.plugin.canvas3d.webgl,max=Math.floor(Math.min(gl.maxRenderbufferSize,gl.maxTextureSize)/2);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>max||height>max)throw failure('UNSUPPORTED_CAPABILITY',`Capture dimensions must be integers from 128 to ${max} pixels on this GPU`);
  if(!['png','jpeg'].includes(format))throw failure('INVALID_ARGUMENT','Image format must be png or jpeg');
  const previous=clone(helper.values);
  const previousBackground=e.plugin.canvas3d.props.renderer.backgroundColor;
  if(a.background==='white'||a.background==='black')e.plugin.canvas3d.setProps({renderer:{backgroundColor:a.background==='white'?0xffffff:0x000000}});
  e.plugin.managers.interactivity.lociHighlights.clearHighlights();e.plugin.managers.interactivity.lociSelects.deselectAll();
  try{
    helper.behaviors.values.next({...helper.values,resolution:{name:'custom',params:{width,height}},format:{name:format,params:format==='jpeg'?{quality:0.95}:{}},transparent:format==='png'&&a.transparent===true});
    const dataUrl=await helper.getImageDataUri();
    if(!dataUrl?.startsWith(`data:image/${format};base64,`))throw failure('EXECUTION_FAILED','Image encoding failed');
    return {value:{dataUrl,width,height,format,transparent:format==='png'&&a.transparent===true,evidence:evidence(e,state),path:a.path??null,filename:`molecular-${state.activeStructureId??'view'}.${format==='jpeg'?'jpg':'png'}`},patch:{}};
  }finally{
    helper.behaviors.values.next(previous);
    if(a.background==='white'||a.background==='black')e.plugin.canvas3d.setProps({renderer:{backgroundColor:previousBackground}});
    if(state.selection)e.select(state.selection);if(state.highlight)e.highlight(state.highlight);
  }
}

export async function exportStructure(e,a,state){
  const selection=e.resolveTarget(a,state),loci=e.lociFor(selection);
  const data=to_mmCIF('molecular-selection',StructureElement.Loci.toStructure(loci),false,{copyAllCategories:true});
  return {value:{text:data,format:'mmcif',evidence:evidence(e,state),path:a.path??null,filename:`structure-${selection.structureId}-selection.cif`,atomCount:StructureElement.Loci.size(loci)},patch:{}};
}

async function setFrame(e,sid,frame){
  const tr=e.trajectories.get(sid);const modelRef=e.models.get(sid);
  if(!tr||!modelRef)throw failure('TARGET_NOT_FOUND','Trajectory is not loaded');
  if(!Number.isInteger(frame))throw failure('INVALID_ARGUMENT','Frame index must be an integer');
  const index=((frame%tr.frameCount)+tr.frameCount)%tr.frameCount;
  await e.plugin.state.data.build().to(modelRef).update(old=>({...old,modelIndex:index})).commit();
  tr.frame=index;const node=e.structureNode(sid);const current=node?.transform?.cell.obj?.data??node?.properties?.cell.obj?.data??node?.cell.obj?.data;
  if(current){e.structures.set(sid,current);e.residues.set(sid,extractResidues(current));}
  return {structureId:sid,frame:index,frameCount:tr.frameCount};
}
export async function trajectory(e,a,state){
  const sid=String(a.structureId??state.activeStructureId);const tr=e.trajectories.get(sid);
  if(!tr)throw failure('TARGET_NOT_FOUND','Trajectory is not loaded');
  if(a.mode==='pause'){clearInterval(e.playTimer);e.playTimer=null;await e.frameWork;return {value:{structureId:sid,frame:tr.frame,frameCount:tr.frameCount,playing:false},patch:{trajectory:{structureId:sid,frame:tr.frame,frameCount:tr.frameCount,playing:false}}};}
  if(tr.frameCount<2)throw failure('UNSUPPORTED_CAPABILITY','This structure contains one frame');
  if(a.mode==='play'){
    const fps=Number(a.fps??5);if(!Number.isFinite(fps)||fps<1||fps>30)throw failure('INVALID_ARGUMENT','Playback FPS must be between 1 and 30');
    clearInterval(e.playTimer);e.playingStructureId=sid;e.playTimer=setInterval(()=>{if(e.frameBusy||e.disposed)return;e.frameBusy=true;e.frameWork=setFrame(e,sid,tr.frame+1).catch(err=>{clearInterval(e.playTimer);e.playTimer=null;e.onError?.(err);}).finally(()=>{e.frameBusy=false;});},1000/fps);
    return {value:{playing:true,frameCount:tr.frameCount},patch:{trajectory:{structureId:sid,frame:tr.frame,frameCount:tr.frameCount,playing:true,fps}}};
  }
  if(a.mode!=='step'&&a.mode!=='frame')throw failure('INVALID_ARGUMENT','Trajectory mode must be play, pause, step or frame');
  clearInterval(e.playTimer);e.playTimer=null;await e.frameWork;const value=await setFrame(e,sid,a.mode==='frame'?Number(a.frame):tr.frame+Number(a.by??1));
  return {value,patch:{trajectory:{...value,playing:false},selection:null,structureUpdates:[e.metadata(sid)]}};
}

export async function exportVideo(e,a,state){
  if(a.startFrame!=null||a.endFrame!=null)return exportTrajectoryRange(e,a,state);
  const canvas=e.plugin.canvas3d?.getCanvas?.()??e.plugin.canvas3d?.webgl?.gl?.canvas;
  if(typeof MediaRecorder==='undefined'||!canvas?.captureStream)throw failure('UNSUPPORTED_CAPABILITY','This browser cannot record the viewport');
  const {mime,format,container}=videoEncoding(a.format);
  const seconds=Number(a.seconds??5),fps=Number(a.fps??24);if(!(seconds>=1&&seconds<=20&&fps>=1&&fps<=60))throw failure('INVALID_ARGUMENT','Record 1–20 seconds at 1–60 FPS');
  const width=Number(a.width??canvas.width),height=Number(a.height??canvas.height);if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>3840||height>2160)throw failure('INVALID_ARGUMENT','Video dimensions must be 128–3840 × 128–2160');
  const output=document.createElement('canvas');output.width=width;output.height=height;const context=output.getContext('2d');
  const previousBackground=e.plugin.canvas3d.props.renderer.backgroundColor;if(a.background==='white'||a.background==='black')e.plugin.canvas3d.setProps({renderer:{backgroundColor:a.background==='white'?0xffffff:0}});
  const stream=output.captureStream(0),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
  const draw=()=>{context.drawImage(canvas,0,0,width,height);track.requestFrame();};let drawing;
  try{
    const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};recorder.onstop=resolve;recorder.onerror=ev=>reject(ev.error??new Error('Video recording failed'));});
    recorder.start(100);draw();drawing=setInterval(draw,1000/fps);
    await new Promise(r=>setTimeout(r,seconds*1000));clearInterval(drawing);draw();await new Promise(r=>setTimeout(r,60));recorder.stop();await stopped;
    const blob=new Blob(chunks,{type:container});if(!blob.size)throw failure(format==='mp4'?'UNSUPPORTED_CAPABILITY':'EXECUTION_FAILED',`${format.toUpperCase()} encoder produced no frames; choose WebM`);
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    return {value:{dataUrl,format,seconds,fps,evidence:evidence(e,state),width,height,path:a.path??null,filename:'molecular-motion.'+format},patch:{}};
  }finally{clearInterval(drawing);if(recorder.state==='recording')recorder.stop();stream.getTracks().forEach(t=>t.stop());if(a.background==='white'||a.background==='black')e.plugin.canvas3d.setProps({renderer:{backgroundColor:previousBackground}});}
}

export async function alignStructures(e,a,state){
  const referenceId=String(a.referenceId??state.activeStructureId),mobileId=String(a.mobileId??'');
  if(referenceId===mobileId)throw failure('INVALID_ARGUMENT','Choose two different structures');
  const targetFor=(sid,chainId)=>{
    const chain=chainsOf(e.residues.get(sid)??[]).find(c=>chainId==null||c.chainId===chainId||c.labelChainId===chainId);
    if(!chain)throw failure('TARGET_NOT_FOUND',`No matching chain in ${sid}`);
    let selection;
    try{selection=e.resolveTarget({structureId:sid,chainId:chain.chainId,atomName:'CA'},state);}catch{selection=e.resolveTarget({structureId:sid,chainId:chain.chainId,atomName:'P'},state);}
    const loci=e.lociFor(selection);if(StructureElement.Loci.size(loci)<3)throw failure('INVALID_ARGUMENT','Alignment requires at least three trace atoms');return {loci,chain};
  };
  const reference=targetFor(referenceId,a.referenceChain),mobile=targetFor(mobileId,a.mobileChain);
  const subtype=StructureProperties.entity.subtype(StructureElement.Loci.getFirstLocation(reference.loci));
  const matched=AlignSequences.compute({a:reference.loci.elements[0],b:mobile.loci.elements[0]},{substMatrix:/(polypeptide|cyclic-pseudo-peptide)/i.test(subtype)?'blosum62':'default'});
  const matchedAtomCount=OrderedSet.size(matched.a.indices);if(matchedAtomCount<3)throw failure('INVALID_ARGUMENT','Fewer than three matching trace atoms');
  const ra=residuesFromLoci(StructureElement.Loci(reference.loci.structure,[matched.a])),rb=residuesFromLoci(StructureElement.Loci(mobile.loci.structure,[matched.b]));
  const correspondence=ra.map((r,i)=>({reference:r,mobile:rb[i]}));
  const result=alignAndSuperpose([reference.loci,mobile.loci])[0];
  if(!result||!Number.isFinite(result.rmsd)||result.rmsd<0)throw failure('EXECUTION_FAILED','Sequence correspondence could not be aligned');
  const node=e.structureNode(mobileId);const params={transform:{name:'matrix',params:{data:result.bTransform,transpose:false}}};
  const update=e.plugin.state.data.build();
  let selector;
  const previous=node.transform?.cell.params?.values?.transform;if(previous?.name==='matrix')params.transform.params.data=Mat4.mul(Mat4(),result.bTransform,previous.params.data);
  if(node.transform)selector=update.to(node.transform.cell).update(params);
  else selector=update.to(node.cell).insert(StateTransforms.Model.TransformStructureConformation,params,{tags:'molecular-superposition'});
  await update.commit();
  const refreshed=e.structureNode(mobileId);const structure=refreshed?.transform?.cell.obj?.data??refreshed?.cell.obj?.data;
  if(structure){e.structures.set(mobileId,structure);e.residues.set(mobileId,extractResidues(structure));}
  const alignment={referenceId,mobileId,referenceChain:reference.chain.chainId,mobileChain:mobile.chain.chainId,rmsd:result.rmsd,alignmentScore:result.alignmentScore,matrix:Array.from(params.transform.params.data),matchedAtomCount,matchedResidueCount:correspondence.length,correspondence,referenceSequence:reference.chain.sequence,mobileSequence:mobile.chain.sequence};
  e.restoredAlignment=JSON.stringify(alignment);
  return {value:alignment,patch:{camera:{...state.camera,alignment},structureUpdates:state.structures.filter(s=>s.structureId===referenceId||s.structureId===mobileId).map(s=>({structureId:s.structureId,display:{...s.display,visible:true}}))}};
}

export async function restoreView(e,state){
 if(state.camera?.clipping&&e.appliedClipping!==JSON.stringify(state.camera.clipping)){const {applyClipping}=await import('./view-settings.js');applyClipping(e,state.camera.clipping);}
 const snapshot=state.camera?.snapshot;if(snapshot&&(!e.cameraRestored||e.viewerOwner===false)&&e.appliedCamera!==JSON.stringify(snapshot)){e.plugin.canvas3d.camera.setState(snapshot,0);e.appliedCamera=JSON.stringify(snapshot);}e.cameraRestored=true;
  const t=state.trajectory;
  if(t?.structureId&&Number.isInteger(t.frame)&&e.trajectories.has(t.structureId)){
    const locallyPlaying=e.playTimer&&e.playingStructureId===t.structureId;
    if(!locallyPlaying&&e.trajectories.get(t.structureId).frame!==t.frame)await setFrame(e,t.structureId,t.frame);
  }  const alignment=state.camera?.alignment;
  if(alignment&&e.restoredAlignment!==JSON.stringify(alignment)&&e.structures.has(alignment.mobileId)){
    const node=e.structureNode(alignment.mobileId),params={transform:{name:'matrix',params:{data:Mat4.copy(Mat4(),alignment.matrix),transpose:false}}};
    const update=e.plugin.state.data.build();if(node.transform)update.to(node.transform.cell).update(params);else update.to(node.cell).insert(StateTransforms.Model.TransformStructureConformation,params,{tags:'molecular-superposition'});await update.commit();
    const refreshed=e.structureNode(alignment.mobileId),structure=refreshed?.transform?.cell.obj?.data??refreshed?.properties?.cell.obj?.data??refreshed?.cell.obj?.data;
    if(structure){e.structures.set(alignment.mobileId,structure);e.residues.set(alignment.mobileId,extractResidues(structure));}e.restoredAlignment=JSON.stringify(alignment);
  }
}
async function exportTrajectoryRange(e,a,state){
 const sid=String(a.structureId??state.activeStructureId),tr=e.trajectories.get(sid);if(!tr||tr.frameCount<2)throw failure('UNSUPPORTED_CAPABILITY','A multi-frame structure is required');
 const start=Number(a.startFrame??0),end=Number(a.endFrame??tr.frameCount-1),fps=Number(a.fps??12),width=Number(a.width??1280),height=Number(a.height??720),count=end-start+1;
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=tr.frameCount)throw failure('INVALID_ARGUMENT','Choose an inclusive frame range within this trajectory');
 if(!Number.isFinite(fps)||fps<1||fps>60||count>600||count/fps>20)throw failure('INVALID_ARGUMENT','Choose 1–60 FPS and a range of at most 600 frames / 20 seconds');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>3840||height>2160)throw failure('UNSUPPORTED_CAPABILITY','Video dimensions must be 128–3840 × 128–2160');
 const {mime,format,container}=videoEncoding(a.format);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
 const original=tr.frame,recordEvidence=evidence(e,state);clearInterval(e.playTimer);e.playTimer=null;await e.frameWork;
 const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};recorder.onstop=resolve;recorder.onerror=ev=>reject(ev.error??new Error('Video encoding failed'));});
 const draw=async frame=>{await setFrame(e,sid,frame);const result=await exportImage(e,{width,height,format:'png',transparent:false,background:a.background},state);const image=new Image();image.src=result.value.dataUrl;await image.decode();ctx.drawImage(image,0,0);};
 try{
  await draw(start);await new Promise(resolve=>{recorder.onstart=resolve;recorder.start();});
  for(let frame=start;frame<=end;frame++){if(frame!==start)await draw(frame);track.requestFrame();await new Promise(r=>setTimeout(r,1000/fps));}
  recorder.stop();await stopped;const blob=new Blob(chunks,{type:container});if(!blob.size)throw failure(format==='mp4'?'UNSUPPORTED_CAPABILITY':'EXECUTION_FAILED',`${format.toUpperCase()} encoder produced no frames; choose WebM`);
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  return {value:{dataUrl,format,fps,width,height,startFrame:start,endFrame:end,frameCount:count,seconds:count/fps,evidence:{...recordEvidence,exportedTrajectory:{structureId:sid,startFrame:start,endFrame:end,fps}},path:a.path??null,filename:`trajectory-${sid}-${start+1}-${end+1}.${format}`},patch:{trajectory:{structureId:sid,frame:original,frameCount:tr.frameCount,playing:false}}};
 }finally{
  if(recorder.state==='recording')recorder.stop();stream.getTracks().forEach(t=>t.stop());await setFrame(e,sid,original);if(state.selection)e.select(state.selection);
 }
}
