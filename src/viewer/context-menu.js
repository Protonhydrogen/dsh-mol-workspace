import * as React from 'react';
import {Icon} from './icons.js';
const h=React.createElement;
export const TAG_COLORS=[['Red','#ef4444'],['Orange','#f97316'],['Yellow','#eab308'],['Green','#22c55e'],['Cyan','#06b6d4'],['Blue','#3b82f6'],['Purple','#8b5cf6'],['Pink','#ec4899'],['White','#f8fafc'],['Gray','#64748b']];
export function ContextMenu({position,state,grain,setGrain,run,addChat,onClose,onLayer}){
 const [expanded,setExpanded]=React.useState('Tag');const selection=state.selection,sid=selection?.structureId??state.activeStructureId;
 const count=selection?.kind==='atom'?selection.atoms.length:selection?.kind==='residue'?selection.residues.length:selection?.chainIds?.length??0;
 const execute=fn=>()=>{onClose();fn();};
 const row=(label,icon,fn,disabled=false,hint)=>h('button',{role:'menuitem',type:'button',disabled,onClick:execute(fn),className:'mw-menu-row',key:label},h(Icon,{name:icon}),h('span',null,label),hint!=null&&h('small',null,hint));
 const submenu=(label,icon,children)=>h('div',{key:label},h('button',{role:'menuitem',type:'button',className:'mw-menu-row','aria-expanded':expanded===label,onClick:()=>setExpanded(expanded===label?null:label)},h(Icon,{name:icon}),h('span',null,label),h('small',null,expanded===label?'⌄':'›')),expanded===label&&h('div',{className:'mw-submenu'},children));
 const selectionStyle=patch=>{
  if(!selection)return;const layer=[...state.tags,...state.layers].find(l=>JSON.stringify(l.selection)===JSON.stringify(selection));
  if(layer)run('setDisplay',{layerId:layer.id,...patch});else run('createLayer',{selection,name:'Selection · '+(selection.residues?.[0]?.authAsymId??selection.atoms?.[0]?.authAsymId??selection.chainIds?.join(',')),...patch});
 };
 const themeNames={'chain-id':'Chain ID','element-symbol':'Element','residue-name':'Residue name','secondary-structure':'Secondary structure',uniform:'Uniform'};
 return h('div',{className:'mw-menu mw-context-menu',role:'menu','aria-label':'Molecular selection menu',style:{left:Math.max(5,position.x),top:Math.max(5,position.y)}},
 submenu('Layer','layers',[
  row('Create selection layer','layers',()=>run('createLayer',{selection,name:'Selection layer'}),!selection),
  ...[...state.tags,...state.layers].map(l=>row(l.name,'layers',()=>onLayer(l.id),false,l.visible===false?'hidden':undefined))]),
 submenu('Color theme','style',Object.entries(themeNames).map(([color,label])=>row(label,'style',()=>selectionStyle({color}),!selection))),
 h('hr'),row('Focus selection','focus',()=>run('focus'),!selection,count||undefined),row('Clear selection','close',()=>run('clearSelection'),!selection),h('hr'),
 submenu('Representation','layers',[['ball-and-stick','Ball & Stick'],['cartoon','Cartoon'],['spacefill','Spacefill'],['backbone','Backbone'],['line','Line'],['molecular-surface','Molecular Surface']].map(([representation,label])=>row(label,'layers',()=>selectionStyle({representation}),!selection))),
 submenu('Tag','tag',[h('div',{className:'mw-menu-caption',key:'caption'},'DEFAULT COLORS'),...TAG_COLORS.map(([name,color])=>h('button',{role:'menuitem',key:name,type:'button',disabled:!selection,className:'mw-menu-row',onClick:execute(()=>run('createTag',{selection,name,colorValue:color}))},h('i',{className:'mw-tag-dot',style:{background:color}}),h('span',null,name)))]),
 row('Align all to selection','align',async()=>{for(const s of state.structures)if(s.structureId!==sid)await run('align',{referenceId:sid,mobileId:s.structureId,referenceChain:selection.residues?.[0]?.authAsymId??selection.atoms?.[0]?.authAsymId??selection.chainIds?.[0]});},!selection||state.structures.length<2),
 row('Remove selected residues','trash',()=>run('hideSelection',{selection}),!selection,count||undefined),row('Send selection to chat','chat',addChat,!selection),h('hr'),
 submenu('Selection mode','select',['atom','residue','chain'].map(kind=>row(kind[0].toUpperCase()+kind.slice(1),kind==='atom'?'atom':'select',()=>setGrain(kind),false,grain===kind?'✓':undefined))),
 row('Undo','reset',()=>run('undo'),!state.undo));
}
