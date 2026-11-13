import * as React from 'react';
import {REPRESENTATION_OPTIONS,COLORS} from '../shared/model.js';
import {selectedRepresentations} from './representation-style.js';
const h=React.createElement;
export const STYLE_PRESETS={
 Default:{description:'A balanced starting point using Mol* defaults.',values:{representation:'auto',opacity:1,emissive:0,metalness:0,roughness:.4,flatShaded:false,bumpFrequency:0}},
 Research:{description:'A clear structural view with backbone and atomic detail.',values:{representations:['cartoon','ball-and-stick'],color:'chain-id',opacity:1,emissive:0,metalness:0,roughness:.6,flatShaded:false}},
 Cinematic:{description:'Smooth ribbons with a soft, polished material.',values:{representation:'polymer-cartoon',color:'chain-id',opacity:1,emissive:.05,metalness:.15,roughness:.25,flatShaded:false}},
 Cartoon:{description:'Flat-shaded ribbons and crisp geometric silhouettes.',values:{representation:'polymer-cartoon',color:'chain-id',opacity:1,emissive:.1,metalness:0,roughness:1,flatShaded:true,bumpFrequency:0}},
 'X-Ray':{description:'A translucent molecular surface over a ribbon backbone.',values:{representations:['cartoon','molecular-surface'],color:'chain-id',opacity:.32,emissive:.08,metalness:.45,roughness:.2,flatShaded:false}},
 Craft:{description:'A warm, matte finish with a subtle textured surface.',values:{representation:'polymer-cartoon',color:'chain-id',opacity:1,emissive:0,metalness:0,roughness:.9,bumpFrequency:1.8,bumpAmplitude:.15,flatShaded:false}},
 Origami:{description:'Angular ribbons with a sharp paper-fold appearance.',values:{representation:'polymer-cartoon',color:'chain-id',opacity:1,emissive:.12,metalness:0,roughness:1,flatShaded:true,bumpFrequency:0}},
};
export function RepresentationPicker({display,onChange}){
 const selected=selectedRepresentations(display);
 return h('div',{className:'mw-repr-picker',role:'group','aria-label':'Representations'},REPRESENTATION_OPTIONS.map(([value,label])=>h('button',{key:value,type:'button',className:'mw-repr-option'+(selected.includes(value)?' active':''),'aria-pressed':selected.includes(value),onClick:()=>onChange({representations:selected.includes(value)?selected.filter(r=>r!==value):[...selected,value]})},h('span',{className:'mw-repr-dot'}),label)),h('div',{className:'mw-repr-footer'},h('button',{type:'button',onClick:()=>onChange({representation:'auto'})},'↶ Reset'),h('button',{type:'button',onClick:()=>onChange({representations:[]})},'× Clear')));
}
function Range({name,label,value,min=0,max=1,step=.01,onChange}){return h('label',{className:'mw-style-range'},h('span',null,label),h('output',null,Number(value).toFixed(2)),h('input',{type:'range','aria-label':name??label,min,max,step,value,onChange:e=>onChange(Number(e.target.value))}));}
function Group({name,children,open=false}){return h('details',{className:'mw-settings-group',open},h('summary',null,name),h('div',{className:'mw-settings-content'},children));}
export function StyleControls({display,onChange,onResetLayer,layerName,disabled}){
 const [templates,setTemplates]=React.useState(false),name=display.stylePreset??'Default',template=STYLE_PRESETS[display.styleTemplate]?display.styleTemplate:STYLE_PRESETS[name]?name:'Default';
 const change=patch=>onChange({...patch,stylePreset:'Custom',styleTemplate:template});
 const checkbox=(label,key,value=false)=>h('label',{className:'mw-row'},h('span',{className:'grow'},label),h('input',{type:'checkbox','aria-label':label,checked:display[key]??value,onChange:e=>change({[key]:e.target.checked})}));
 const range=(label,key,fallback,max=1)=>h(Range,{label,value:display[key]??fallback,max,onChange:value=>change({[key]:value})});
 return h('fieldset',{className:'mw-style-controls',disabled},
  layerName&&h('button',{className:'mw-btn',onClick:onResetLayer},'← Structure style'),
  h('div',{className:'mw-style-template'},h('span',null,'Style'),h('button',{className:'mw-template-button','aria-expanded':templates,onClick:()=>setTemplates(!templates)},name+' ⌃'),templates&&h('div',{className:'mw-template-menu'},Object.entries(STYLE_PRESETS).map(([preset,p])=>h('button',{key:preset,className:preset===name?'active':'',onClick:()=>{onChange({...p.values,stylePreset:preset,styleTemplate:preset,resetStyle:true});setTemplates(false);}},h('strong',null,preset),h('small',null,p.description))))),
  h('div',{className:'mw-repr-pills'},REPRESENTATION_OPTIONS.map(([value,label])=>h('button',{key:value,className:selectedRepresentations(display).includes(value)?'active':'',onClick:()=>change({representation:value})},label))),
  h(Group,{name:'DISPLAY',open:true},h('label',{className:'mw-row'},h('span',null,'Color theme'),h('select',{'aria-label':'Color theme',value:display.color??'chain-id',onChange:e=>change({color:e.target.value})},COLORS.map(c=>h('option',{value:c,key:c},c)))),h('label',{className:'mw-row'},h('span',null,'Uniform color'),h('input',{type:'color','aria-label':'Uniform color',value:display.colorValue??'#a78bfa',onChange:e=>change({color:'uniform',colorValue:e.target.value})})),h('label',{className:'mw-row'},h('span',null,'Quality'),h('select',{'aria-label':'Rendering quality',value:display.quality??'auto',onChange:e=>change({quality:e.target.value})},['auto','lowest','low','medium','high','higher','highest','custom'].map(q=>h('option',{value:q,key:q},q)))),range('Alpha','opacity',1),range('Emissive','emissive',0)),
  h(Group,{name:'GEOMETRY'},range('Size factor','sizeFactor',.2,2)),
  h(Group,{name:'SHADING'},checkbox('Flat shaded','flatShaded'),range('Texture frequency','bumpFrequency',0,10),range('Texture amplitude','bumpAmplitude',1,5)),
  h(Group,{name:'MATERIAL'},range('Metalness','metalness',0),range('Roughness','roughness',.4),range('Bumpiness','bumpiness',0)),
  h(Group,{name:'ATOMS'},checkbox('Ignore hydrogens','ignoreHydrogens')),
  h(Group,{name:'CARTOON'},checkbox('Tubular helices','tubularHelices'),range('Ribbon aspect ratio','aspectRatio',5,10),range('Sheet arrow factor','arrowFactor',1.5,3)),
  h(Group,{name:'RENDERING'},h('p',{className:'mw-help'},'These settings apply to the current structure or selection layer. Camera clipping is available under View.'),h('label',{className:'mw-row'},h('span',null,'Background'),h('input',{type:'color','aria-label':'Canvas background',value:display.background??'#0b0c10',onChange:e=>change({background:e.target.value})}))),
  h('button',{className:'mw-reset-template',onClick:()=>onChange({...STYLE_PRESETS[template].values,stylePreset:template,styleTemplate:template,resetStyle:true})},'↶ Reset to '+template+' template'));
}
