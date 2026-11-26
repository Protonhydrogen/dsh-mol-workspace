import {pauseForCitation} from '../shared/citation-frame.js';
import {Dashboard} from './dashboard.js';
import {StyleControls} from './style-controls.js';
import {ViewControls} from './view-controls.js';
import {ContextMenu} from './context-menu.js';
import * as React from 'react';
import { MolEngine } from './engine.js';
import { ExportControls } from './export-ui.js';
import { Icon } from './icons.js';
import { Sequence } from './sequence.js';
import { COLORS, MEASUREMENTS, id } from '../shared/model.js';
import { themeScheme } from '../shared/theme.js';
import { normalizeSelection } from '../shared/selection.js';
const h=React.createElement;
const EMPTY={revision:0,structures:[],selection:null,tags:[],layers:[],measurements:[],commands:[],camera:{},trajectory:{},viewer:{connected:false}};
const LABELS={load:'Load Structure',style:'Style',camera:'View',measure:'Measurements',tag:'Tags & Layers',export:'Capture',layers:'Molecular Graphics',distance:'Distance',angle:'Angle',dihedral:'Dihedral',label:'Label',orientation:'Orientation',plane:'Plane'};
function IButton({icon,title,onClick,active,disabled}){return h('button',{type:'button',className:'mw-icon'+(active?' active':''),title,'aria-label':title,'aria-pressed':!!active,onClick,disabled},h(Icon,{name:icon}));}
function Button({children,onClick,disabled,primary,title}){return h('button',{type:'button',className:'mw-btn'+(primary?' primary':''),onClick,disabled,title},children);}
function Row({label,children}){return h('div',{className:'mw-row'},h('label',null,label),children);}
function Panel({name,title,onClose,children,className=''}){return h('section',{className:`mw-panel ${className}`,'aria-label':title??LABELS[name]},h('div',{className:'mw-panel-title'},h('span',null,title??LABELS[name]),h(IButton,{icon:'close',title:'Close panel',onClick:onClose})),h('div',{className:'mw-panel-body'},children));}
function summarize(selection){
  if(!selection)return ['No target selected','Select a target in the structure or Sequence panel'];
  if(selection.kind==='atom'){const a=selection.atoms?.[0];return [`${a?.authAtomId??a?.labelAtomId??'?'} · ${a?.authAsymId??''}:${a?.authSeqId??''}${a?.insCode??''}`,`Structure ${selection.structureId} · Model ${a?.modelId??1} · ${a?.element??''}${a?.altId?' · alt '+a.altId:''} · Single atom`];}
  if(selection.kind==='chain')return [`Chain ${selection.chainIds?.join(', ')}`,`Structure ${selection.structureId} · Whole-chain selection`];
  const rs=selection.residues??[],first=rs[0],last=rs.at(-1);
  return [`${rs.length} residues · ${first?.authAsymId??''}:${first?.authSeqId??''}${first?.insCode??''}${rs.length>1?' – '+last.authSeqId+(last.insCode??''):''}`,`Structure ${selection.structureId} · auth / PDB numbering`];
}

export function Workspace({sessionId,adapter}){
  const root=React.useRef(null),canvas=React.useRef(null),engine=React.useRef(null),api=React.useRef(adapter);api.current=adapter;
  const [theme,setTheme]=React.useState(()=>themeScheme(adapter.getTheme?.())??(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
  const [ready,setReady]=React.useState(false),[state,setState]=React.useState(EMPTY),[panel,setPanel]=React.useState('load'),[scene,setScene]=React.useState(true),[narrow,setNarrow]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[path,setPath]=React.useState(''),[loading,setLoading]=React.useState(false),[grain,setGrain]=React.useState('residue'),[menu,setMenu]=React.useState(null);
  const [measureType,setMeasureType]=React.useState('distance'),[armed,setArmed]=React.useState(null),[pointCount,setPointCount]=React.useState(0),[tagName,setTagName]=React.useState(''),[tagColor,setTagColor]=React.useState('#9a7cff'),[targetLayer,setTargetLayer]=React.useState(null),[targetMeasure,setTargetMeasure]=React.useState(null),[styleStructureId,setStyleStructureId]=React.useState(null);
  const [imageFormat,setImageFormat]=React.useState('png'),[imageSize,setImageSize]=React.useState('1920x1080'),[transparent,setTransparent]=React.useState(false),[exportPath,setExportPath]=React.useState(''),[lastExport,setLastExport]=React.useState(null),[fps,setFps]=React.useState(5);
  const stateRef=React.useRef(state),grainRef=React.useRef(grain),armedRef=React.useRef(null),points=React.useRef([]),localSelection=React.useRef(undefined),viewerId=React.useRef(id('viewer')),polling=React.useRef(false),lastRevision=React.useRef(-1);
  const active=state.structures.find(s=>s.structureId===state.activeStructureId)??state.structures[0];const sid=active?.structureId;
  const layer=[...state.layers,...state.tags].find(l=>l.id===targetLayer);const measurement=state.measurements.find(m=>m.id===targetMeasure);
  const styleStructure=state.structures.find(s=>s.structureId===styleStructureId)??active;
  const display=layer?{representation:'ball-and-stick',color:'uniform',opacity:1,...layer.display,colorValue:layer.color}:styleStructure?.display??{representation:'auto',color:'chain-id',opacity:1};
  const accept=next=>{if(next&&next.revision>=lastRevision.current){lastRevision.current=next.revision;stateRef.current=next;setState(next);}};
  const notify=text=>{setNotice(text);setTimeout(()=>setNotice(''),3500);};
  const run=async(action,args={})=>{setError('');try{return await api.current.enqueueCommand({id:id('cmd'),action,args:{...(sid?{structureId:sid}:{}),...args}});}catch(err){setError(String(err?.message??err));return null;}};
  const updateSelection=async sel=>{
    localSelection.current=sel;setState(s=>({...s,selection:sel,activeStructureId:sel?.structureId??s.activeStructureId}));
    try{engine.current?.select(sel);const next=await api.current.setSelection(sel);accept(next);}
    catch(err){setError(String(err?.message??err));}finally{localSelection.current=undefined;}
  };
  const takeTarget=sel=>{
    if(!sel)return;
    if(armedRef.current){
      const type=armedRef.current;points.current.push(sel);setPointCount(points.current.length);engine.current?.select(sel);
      const required={distance:2,angle:3,dihedral:4,label:1}[type];
      if(required&&points.current.length>=required){const chosen=points.current.slice(0,required);armedRef.current=null;setArmed(null);points.current=[];run('createMeasurement',{type,points:chosen,colorValue:tagColor});}
    }else updateSelection(sel);
  };
  const targetHandler=React.useRef(takeTarget);targetHandler.current=takeTarget;
  const errorHandler=React.useRef(setError);errorHandler.current=setError;

  React.useEffect(()=>{
    const observer=new ResizeObserver(entries=>{const isNarrow=entries[0].contentRect.width<600;setNarrow(isNarrow);if(isNarrow)setScene(false);});observer.observe(root.current);return()=>observer.disconnect();
  },[]);
  React.useEffect(()=>{const sync=s=>setTheme(themeScheme(s)??'light');const off=adapter.subscribeTheme?.(sync);if(adapter.getTheme)sync(adapter.getTheme());else{const media=matchMedia('(prefers-color-scheme:dark)'),changed=()=>setTheme(media.matches?'dark':'light');media.addEventListener('change',changed);return()=>media.removeEventListener('change',changed);}return off;},[adapter]);
  React.useEffect(()=>{engine.current?.setTheme(theme,active?.display);},[theme,ready,sid,active?.display?.background]);
  React.useEffect(()=>{grainRef.current=grain;engine.current?.setGranularity(grain);},[grain,ready]);
  React.useEffect(()=>{stateRef.current=state;},[state]);
  React.useEffect(()=>{
    let disposed=false;const e=new MolEngine();e.readPotentialGrid=path=>api.current.getPotentialGrid(path);e.readTrajectoryData=(sid,path)=>api.current.getTrajectoryData(sid,path);engine.current=e;setReady(false);lastRevision.current=-1;viewerId.current=id('viewer');
    e.onError=err=>errorHandler.current(String(err?.message??err));
    e.onClear=()=>{if(!armedRef.current)run('clearSelection');};
    e.onPick=(residues,atoms,structureId,ev)=>{
      const kind=grainRef.current;const sel=normalizeSelection({structureId,kind,residues:kind==='residue'?residues:[],atoms:kind==='atom'?atoms:[],chainIds:kind==='chain'?[atoms[0]?.authAsymId??residues[0]?.authAsymId].filter(Boolean):[]});
      if((kind==='atom'&&!sel.atoms.length)||(kind==='residue'&&!sel.residues.length))return;
      if(ev.button===2){updateSelection(sel);return;}
      const wasMeasuring=!!armedRef.current;targetHandler.current(sel);if(!wasMeasuring)e.focus(sel).catch(err=>errorHandler.current(err.message));
    };
    e.mount(canvas.current).then(()=>{if(!disposed)setReady(true);}).catch(err=>{if(!disposed)setError(String(err?.message??err));});
    return()=>{disposed=true;armedRef.current=null;polling.current=false;api.current.releaseViewer(viewerId.current).catch(()=>{});e.dispose();engine.current=null;};
  },[sessionId]);
  React.useEffect(()=>{
    if(!ready)return;let disposed=false;
    const tick=async()=>{
      const e=engine.current;if(!e||e.disposed||polling.current)return;polling.current=true;
      try{
        const lease=await api.current.updateViewer(viewerId.current,{...(e.cameraRestored?{camera:e.plugin.canvas3d.camera.getSnapshot()}:{}),...(e.playback?.playing?{trajectory:{structureId:e.playingStructureId,frame:e.trajectories.get(e.playingStructureId)?.frame,frameCount:e.trajectories.get(e.playingStructureId)?.frameCount,playing:true,fps:e.playback.options.fps},measurementValues:[...e.measurementItems.values()].map(item=>item.record)}:{}),capabilities:{measurements:MEASUREMENTS,image:true,video:typeof MediaRecorder!=='undefined'}});
        e.viewerOwner=lease.owner;if(!lease.owner&&e.playback?.playing){await e.playback.pause();}
        let next=await api.current.getState();
        for(const s of next.structures){if(!e.structures.has(s.structureId)){const data=await api.current.getStructureData(s.structureId);if(disposed)return;await e.load(s.structureId,data.data,data.format,s.title);}if(lease.owner&&s.atomCount==null)await api.current.publishMetadata(viewerId.current,e.metadata(s.structureId));}
        next=await api.current.getState();if(disposed)return;
        await e.sync(localSelection.current!==undefined?{...next,selection:localSelection.current}:next);
        if(lease.owner)for(const pending of next.commands.filter(c=>c.status==='pending')){
          const c=await api.current.claimCommand(viewerId.current,pending.id);if(!c)continue;
          try{
            const result=await e.execute(c,next);const completed=await api.current.completeCommand(viewerId.current,{id:c.id,ok:true,...result});
            if(completed.status!=='succeeded')throw new Error(completed.error?.message??('Operation '+completed.status));
            if(completed.result?.path){setLastExport(completed.result);notify('Saved: '+completed.result.path);}else if(!['select','setDisplay','focus','highlight'].includes(c.action))notify(`${c.action} completed`);
          }catch(err){
            setError(String(err?.message??err));await api.current.completeCommand(viewerId.current,{id:c.id,ok:false,error:{code:err.code??'EXECUTION_FAILED',message:String(err?.message??err)}}).catch(()=>{});
          }
          next=await api.current.getState();
        }
        if(!disposed){await e.sync(next);accept(next);}
      }catch(err){if(!disposed)setError(String(err?.message??err));}
      finally{polling.current=false;}
    };
    tick();const timer=setInterval(tick,500);const heartbeat=setInterval(()=>api.current.updateViewer(viewerId.current,{}).catch(()=>{}),4000);
    return()=>{disposed=true;clearInterval(timer);clearInterval(heartbeat);};
  },[ready,sessionId]);

  const load=async(value=path)=>{if(!value.trim()||loading)return;setLoading(true);setError('');try{await api.current.load(value.trim());accept(await api.current.getState());setPanel(null);}catch(err){setError(String(err?.message??err));}finally{setLoading(false);}};
  const openPanel=name=>{if(name==='style'){setStyleStructureId(sid);setTargetLayer(null);}setPanel(panel===name?null:name);if(narrow)setScene(false);setMenu(null);};
  const setStyle=patch=>run('setDisplay',{...(layer?{layerId:layer.id}:{structureId:styleStructure?.structureId??sid}),...patch});
  const onSequence=rs=>{if(!sid)return;if(armedRef.current){for(const r of rs)targetHandler.current(normalizeSelection({structureId:sid,kind:'residue',residues:[r]}));}else updateSelection(normalizeSelection({structureId:sid,kind:'residue',residues:rs}));};
  const addChat=async()=>{try{
    const selection=stateRef.current.selection,target=selection?.structureId??stateRef.current.activeStructureId,e=engine.current;
    const playing=e?.playback?.playing&&e.playingStructureId===target;
    if(playing)await pauseForCitation(api.current,target);
    if(e?.disposed)return;
    await api.current.addToChat(selection);
    notify(playing?'Paused playback and added the captured frame to the conversation input.':'Added to the conversation input. Review it on the left before sending.');
  }catch(err){setError(err.message);}};
  const arm=()=>{points.current=[];setPointCount(0);armedRef.current=measureType;setArmed(measureType);notify('Pick the endpoints in order in the structure or sequence.');};
  const measurementText=m=>`${LABELS[m.type]}${m.value!=null?' '+Number(m.value).toFixed(2)+' '+m.unit:''}`;
  React.useEffect(()=>{if(state.structures.length)setPanel(p=>p==='load'?null:p);},[state.structures.length]);
  const [targetTitle,targetDetail]=summarize(state.selection);const busy=state.commands.some(c=>c.status==='pending'||c.status==='running');
  const visibleCount=state.structures.filter(s=>s.display?.visible!==false).length;

  function renderPanel(){
    if(panel==='load')return h(Panel,{name:'load',onClose:()=>setPanel(null)},h('div',{className:'mw-kicker'},'STRUCTURE SOURCE'),h('input',{className:'mw-input',value:path,placeholder:'PDB ID or .pdb / .cif file path','aria-label':'Structure source',onChange:ev=>setPath(ev.target.value),onKeyDown:ev=>{if(ev.key==='Enter')load();}}),h('div',{className:'mw-row'},h(Button,{primary:true,disabled:!ready||loading||!path.trim(),onClick:()=>load()},loading?'Loading…':'Load structure'),h(Button,{disabled:!ready||loading,onClick:()=>load('1QYS')},'Example TOP7')),h('p',{className:'mw-help'},'Open a project PDB/mmCIF file or enter a PDB ID. Structures, selections and measurements stay with this conversation.'),h('div',{className:'mw-kicker'},'AGENT CONNECTED'),h('p',{className:'mw-help'},'Ask the Agent to load a structure, or select a target and choose Add to Chat. The Agent can inspect exact atom identities and operate the view.'));
    if(panel==='style')return h(Panel,{name:'style',title:layer?'Layer style · '+layer.name:'Style · '+(styleStructure?.title??'Structure'),onClose:()=>setPanel(null)},h(StyleControls,{display,onChange:setStyle,onResetLayer:()=>setTargetLayer(null),layerName:layer?.name,disabled:!sid}));
    if(panel==='camera')return h(Panel,{name:'camera',onClose:()=>setPanel(null)},h(ViewControls,{state,active,run}));
    if(panel==='tag')return h(Panel,{name:'tag',onClose:()=>setPanel(null)},h('div',{className:'mw-kicker'},'NAMED SELECTION'),h('input',{className:'mw-input',value:tagName,placeholder:'e.g. Active pocket, mutation candidates','aria-label':'Tag name',onChange:ev=>setTagName(ev.target.value)}),h(Row,{label:'Tag color'},h('input',{type:'color','aria-label':'Tag color',value:tagColor,onChange:ev=>setTagColor(ev.target.value)})),h('div',{className:'mw-grid'},h(Button,{primary:true,disabled:!state.selection,onClick:()=>run('createTag',{name:tagName||'New tag',colorValue:tagColor})},'Create tag'),h(Button,{disabled:!state.selection,onClick:()=>run('createLayer',{name:tagName||'Selection layer',colorValue:tagColor})},'Create layer')),h('p',{className:'mw-help'},'Tags retain structure, chain, residue and atom identities. Colors appear in both the sequence and 3D view.'),h('div',{className:'mw-kicker'},'NEIGHBORHOOD'),h(Button,{disabled:!state.selection,onClick:()=>run('neighbors',{radius:5})},'Select neighbors within 5 Å'));
    if(panel==='measure')return h(Panel,{name:'measure',onClose:()=>setPanel(null)},h('div',{className:'mw-kicker'},'MEASUREMENT TYPE'),h('div',{className:'mw-pills'},MEASUREMENTS.map(type=>h('button',{key:type,className:'mw-btn'+(measureType===type?' active':''),onClick:()=>{setMeasureType(type);setTargetMeasure(null);}},LABELS[type]))),h('div',{className:'mw-row'},h(Button,{primary:true,disabled:!sid,onClick:arm},armed?'Restart picking':'Pick endpoints'),h(Button,{disabled:!state.selection,onClick:()=>run('createMeasurement',{type:measureType,colorValue:tagColor,text:measureType==='label'?(tagName||'Tag'):''})},'Use current selection')),h('p',{className:'mw-help'},armed?`Creating ${LABELS[armed]}: ${pointCount} points. ${['plane','orientation'].includes(armed)?'Choose Finish picking when ready.':''}`:'Distance: 2 points. Angle: 3. Dihedral: 4. Residue mode uses CA / nucleic P; atom mode uses the exact picked atom.'),armed&&h('div',{className:'mw-row'},['plane','orientation'].includes(armed)&&h(Button,{disabled:pointCount<3,onClick:()=>{run('createMeasurement',{type:armed,points:points.current,colorValue:tagColor});armedRef.current=null;setArmed(null);points.current=[];}},'Finish picking'),h(Button,{onClick:()=>{armedRef.current=null;setArmed(null);points.current=[];setPointCount(0);}},'Cancel picking')),measurement&&h('div',null,h('hr',{className:'mw-divider'}),h('div',{className:'mw-kicker'},measurement.name),h('div',{className:'mw-help'},measurementText(measurement)),h('ol',{className:'mw-point-list'},(measurement.actualPoints??[]).map((p,i)=>h('li',{key:i},`Structure ${p.structureId} · M${p.atom?.modelId} · ${p.atom?.authAsymId}:${p.atom?.authSeqId}${p.atom?.insCode??''} · ${p.atom?.authAtomId??p.atom?.labelAtomId} · ${p.atom?.altId?'alt '+p.atom.altId:'primary conformer'} · [${p.position.map(n=>Number(n).toFixed(3)).join(', ')}] Å`))),h(Row,{label:'Color'},h('input',{type:'color','aria-label':'Measurement color',value:measurement.style?.color??'#a78bfa',onChange:ev=>run('styleMeasurement',{id:measurement.id,colorValue:ev.target.value})})),h(Row,{label:'Opacity'},h('input',{type:'range',min:0,max:1,step:.05,'aria-label':'Measurement opacity',value:measurement.style?.opacity??1,onChange:ev=>run('styleMeasurement',{id:measurement.id,opacity:Number(ev.target.value)})})),measurement.type==='orientation'&&h(Row,{label:'Orientation shape'},h('select',{'aria-label':'Orientation shape',value:measurement.style?.geometry??'box',onChange:ev=>run('styleMeasurement',{id:measurement.id,geometry:ev.target.value})},['box','axes','ellipsoid'].map(v=>h('option',{key:v,value:v},v)))),h(Button,{onClick:()=>api.current.addNote('[Molecular measurement]\n'+JSON.stringify(measurement,null,2)).then(()=>notify('Measurement reference added to the conversation input.')).catch(err=>setError(err.message))},'Add measurement to Chat')),h('hr',{className:'mw-divider'}),state.measurements.map(m=>h('button',{key:m.id,className:'mw-btn',style:{width:'100%',margin:'3px 0',justifyContent:'start'},onClick:()=>setTargetMeasure(m.id)},measurementText(m))),h('div',{className:'mw-row'},h(Button,{disabled:!state.measurements.length,onClick:()=>run('clearMeasurements')},'Clear all measurements')));
    if(panel==='export')return h(Panel,{name:'export',onClose:()=>setPanel(null)},h(ExportControls,{active,selection:state.selection,run,state,lastExport}));
    return null;
  }

  return h('div',{className:'mw','data-theme':theme,ref:root,'data-mw-state':ready?'ready':'loading',onPointerDown:ev=>{if(!ev.target.closest('.mw-menu'))setMenu(null);}},
    h('header',{className:'mw-head'},h('span',{className:'mw-logo'},h(Icon,{name:'molecule'})),h('span',{className:'mw-head-title'},'Mol* Viewer'),h('span',{className:'mw-head-name',title:active?.title},active?.title??'Structure as context'),h('span',{className:'mw-dot'+(state.viewer.connected?' on':''),title:state.viewer.connected?'Agent connected':'Waiting for viewer'}),h(IButton,{icon:'layers',title:'Molecular Graphics',active:scene,onClick:()=>{setScene(!scene);if(narrow)setPanel(null);}}),h(IButton,{icon:'expand',title:'Fullscreen viewer',onClick:()=>{if(document.fullscreenElement)document.exitFullscreen();else root.current.requestFullscreen().catch(err=>setError(err.message));}})),
    h('main',{className:'mw-stage',onContextMenu:ev=>{if(ev.target.closest('.mw-panel,.mw-rail,.mw-target'))return;ev.preventDefault();const r=ev.currentTarget.getBoundingClientRect();setMenu({x:Math.min(ev.clientX-r.left,r.width-280),y:Math.min(ev.clientY-r.top,r.height-450)});}},h('div',{className:'mw-canvas',ref:canvas}),
      h('nav',{className:'mw-rail','aria-label':'Molecular tools'},['load','export','style','camera','measure','tag'].map(name=>h(IButton,{key:name,icon:name==='export'?'camera':name==='camera'?'reset':name,title:LABELS[name],active:panel===name,onClick:()=>openPanel(name)})),h('hr'),h(IButton,{icon:grain==='atom'?'atom':'select',title:`Selection mode: ${grain==='atom'?'Atom':grain==='chain'?'Chain':'Residue'}`,active:grain==='atom',onClick:()=>setGrain(g=>g==='residue'?'atom':g==='atom'?'chain':'residue')})),
      renderPanel(),
      scene&&h(Dashboard,{state,activeId:sid,run,onClose:()=>setScene(false),frames:engine.current?.trajectories,
        onActivate:s=>{setTargetLayer(null);setStyleStructureId(s.structureId);run('select',{structureId:s.structureId,selection:{structureId:s.structureId,kind:'chain',chainIds:(s.chains??[]).map(c=>c.chainId)}});},
        onStyle:s=>{setTargetLayer(null);setStyleStructureId(s.structureId);run('select',{structureId:s.structureId,selection:{structureId:s.structureId,kind:'chain',chainIds:(s.chains??[]).map(c=>c.chainId)}});setPanel('style');if(narrow)setScene(false);},
        onChat:s=>api.current.addToChat({structureId:s.structureId,kind:'chain',chainIds:(s.chains??[]).map(c=>c.chainId)}).then(()=>notify('Added to the conversation input.')).catch(err=>setError(err.message)),
        onObject:(item,kind)=>{if(kind==='measurement'){setTargetMeasure(item.id);setPanel('measure');}else{setTargetLayer(item.id);setStyleStructureId(item.selection.structureId);setPanel('style');}if(narrow)setScene(false);}}),
      !state.structures.length&&h('div',{className:'mw-empty'},h(Icon,{name:'molecule'}),h('strong',null,'Structure as part of the conversation'),h('span',null,'Load PDB/mmCIF, select in 3D or Sequence, and share precise molecular context with the Agent.')),
      state.focus&&h('div',{className:'mw-interaction-note'},'Potential interactions · Mol* geometric predictions · 5 Å context'),
      sid&&h('div',{className:'mw-target'},h(Icon,{name:grain==='atom'?'atom':'select'}),h('div',{className:'mw-target-text'},h('div',{className:'mw-target-title'},armed?`${LABELS[armed]} · ${pointCount} points`:targetTitle),h('div',{className:'mw-target-detail'},targetDetail)),state.selection&&h(IButton,{icon:'focus',title:'Focus target',onClick:()=>run('focus')}),h(Button,{primary:true,disabled:!sid,onClick:addChat},state.selection?'Add to Chat':'Add structure to Chat')),
      menu&&h(ContextMenu,{position:menu,state,grain,setGrain,run,addChat,onClose:()=>setMenu(null),onLayer:layerId=>{setTargetLayer(layerId);setStyleStructureId([...state.tags,...state.layers].find(l=>l.id===layerId)?.selection.structureId);setPanel('style');if(narrow)setScene(false);}})),    h(Sequence,{residues:engine.current?.residues.get(sid)??[],selection:state.selection?.structureId===sid?state.selection:null,tags:state.tags,onSelect:onSequence,alignment:state.camera.alignment,onAlign:mobileId=>run('align',{referenceId:sid,mobileId}),structures:state.structures,activeStructureId:sid}),
    h('footer',{className:'mw-status'+(error?' error':''),'role':error?'alert':'status'},h('span',{className:'grow'},error||(!ready?'Initializing Mol*…':busy?'Executing molecular command…':`${state.structures.length} Structure · ${active?.residueCount??0} residues · ${active?.atomCount??0} atoms`)),error?h('button',{title:'Dismiss error',onClick:()=>setError('')},'×'):h('span',null,`${state.viewer.connected?'● Connected':'○ Disconnected'} · ${typeof __DSH_MOL_VERSION__ === 'string' ? 'v'+__DSH_MOL_VERSION__ : 'development'}`)),notice&&h('div',{className:'mw-toast',role:'status'},notice));
}
