import * as React from 'react';
import { chainsOf, oneLetter, residueKey } from './targets.js';
const h=React.createElement;
export function Sequence({residues,selection,tags,onSelect,alignment,onAlign,structures,activeStructureId}){
  const chains=React.useMemo(()=>chainsOf(residues),[residues]);const [chainKey,setChainKey]=React.useState(null),[collapsed,setCollapsed]=React.useState(false),[tab,setTab]=React.useState('sequence'),[height,setHeight]=React.useState(148);
  const anchor=React.useRef(null),drag=React.useRef(null),suppressClick=React.useRef(false),selected=React.useMemo(()=>new Set([...(selection?.residues??[]),...(selection?.atoms??[])].map(residueKey)),[selection]);
  const chain=chains.find(c=>c.key===chainKey)??chains[0];
  const pick=(start,end)=>{const lo=Math.min(start,end),hi=Math.max(start,end);onSelect(chain.residues.slice(lo,hi+1));};
  React.useEffect(()=>{if(selection?.structureId!==activeStructureId||!selection)return;const r=selection.residues?.[0]??selection.atoms?.[0];if(r)setChainKey(`${r.modelId}:${r.labelAsymId}`);},[selection,activeStructureId]);
  const finish=()=>{if(drag.current){if(drag.current.moved){pick(drag.current.start,drag.current.end);suppressClick.current=true;anchor.current=drag.current.start;}drag.current=null;}};
  React.useEffect(()=>{window.addEventListener('pointerup',finish);return()=>window.removeEventListener('pointerup',finish);});
  const resize=ev=>{ev.preventDefault();const y=ev.clientY,base=height;ev.currentTarget.setPointerCapture(ev.pointerId);const node=ev.currentTarget;const move=e=>setHeight(Math.min(360,Math.max(74,base+y-e.clientY)));const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);};node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);};
  return h('section',{className:'mw-sequence'+(collapsed?' collapsed':''),style:{height},'aria-label':'Sequence and Alignment'},
    h('div',{className:'mw-seq-resize',onPointerDown:resize,title:'Drag to resize the Sequence panel'}),
    h('div',{className:'mw-seq-head'},h('div',{className:'mw-tabs'},h('button',{className:'mw-tab '+(tab==='sequence'?'active':''),onClick:()=>{setTab('sequence');setCollapsed(false);}},'Sequence'),h('button',{className:'mw-tab '+(tab==='alignment'?'active':''),onClick:()=>{setTab('alignment');setCollapsed(false);}},'Alignment')),
      chains.length>0&&h('select',{'aria-label':'Sequence chain',value:chain?.key??'',onChange:ev=>{setChainKey(ev.target.value);anchor.current=null;}},chains.map(c=>h('option',{key:c.key,value:c.key},`${c.chainId||'—'} · ${c.residueCount} aa · M${c.modelId}`))),
      h('button',{className:'mw-tab',title:'Collapse Sequence',onClick:()=>setCollapsed(!collapsed),'aria-expanded':!collapsed},collapsed?'⌃':'⌄')),
    !collapsed&&h('div',{className:'mw-seq-content'},tab==='alignment'?h('div',null,
      h('div',{className:'mw-help'},'Match chain sequences, then fit the CA/P backbone.'),
      h('button',{className:'mw-btn',disabled:structures.length<2,onClick:()=>onAlign(structures.find(s=>s.structureId!==activeStructureId)?.structureId)},'Align to another structure'),
      alignment&&h('div',{className:'mw-alignment'},`RMSD ${Number(alignment.rmsd).toFixed(3)} Å\n${alignment.referenceId}:${alignment.referenceChain}\n${alignment.referenceSequence}\n${alignment.mobileId}:${alignment.mobileChain}\n${alignment.mobileSequence}`)):
      !chain?h('div',{className:'mw-help'},'Load a structure to show its numbered single-letter sequence.'):
      h('div',{className:'mw-residues',onPointerLeave:()=>{}},chain.residues.map((r,i)=>{
        const key=residueKey(r),isSelected=selection?.kind==='chain'?selection.chainIds.includes(r.authAsymId):selected.has(key);
        const tag=tags.find(t=>t.selection.structureId===activeStructureId&&(t.selection.kind==='chain'?t.selection.chainIds.includes(r.authAsymId):[...(t.selection.residues??[]),...(t.selection.atoms??[])].some(p=>residueKey(p)===key)));
        return h('button',{key,className:'mw-residue'+(isSelected?' selected':'')+(tag?' tagged':''),style:tag?{'--tag-color':tag.color}:{},'aria-label':`${r.compId} ${r.authAsymId}:${r.authSeqId}${r.insCode??''}`,'aria-pressed':isSelected,title:`${r.compId} · ${r.authAsymId}:${r.authSeqId}${r.insCode??''} · label ${r.labelAsymId}:${r.labelSeqId}`,
          onPointerDown:ev=>{if(ev.button!==0)return;drag.current={start:i,end:i,moved:false};},onPointerEnter:()=>{if(drag.current){drag.current.end=i;drag.current.moved=drag.current.start!==i;}},
          onClick:ev=>{if(suppressClick.current){suppressClick.current=false;return;}const start=ev.shiftKey&&anchor.current!=null?anchor.current:i;pick(start,i);if(!ev.shiftKey)anchor.current=i;}},h('span',{className:'num'},i===0||i%10===0?`${r.authSeqId}${r.insCode??''}`:''),h('span',{className:'aa'},oneLetter(r.compId)));
      }))));
}
