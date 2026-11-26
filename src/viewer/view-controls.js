import * as React from 'react';
import {CLIPPING_PARAMS,DEFAULT_CLIPPING} from './view-settings.js';
const h=React.createElement;
export function ViewControls({state,active,run}){
 const clipping={...DEFAULT_CLIPPING,...state.camera.clipping};
 const apply=patch=>run('camera',{mode:'clipping',...clipping,...patch});
 const range=(key,label,params)=>h('label',{className:'mw-style-range'},h('span',null,label),h('output',null,clipping[key]),h('input',{type:'range','aria-label':label,min:params.min,max:Math.max(params.max,params.defaultValue),step:params.step,value:clipping[key],onChange:e=>apply({[key]:Number(e.target.value)})}));
 return h(React.Fragment,null,h('div',{className:'mw-grid'},h('button',{className:'mw-btn',onClick:()=>run('camera',{mode:'reset'})},'Overview'),h('button',{className:'mw-btn',disabled:!state.selection,onClick:()=>run('camera',{mode:'focus'})},'Focus selection'),h('button',{className:'mw-btn',onClick:()=>run('camera',{mode:'spin',enabled:true})},'Spin'),h('button',{className:'mw-btn',onClick:()=>run('camera',{mode:'spin',enabled:false})},'Stop spin')),
  h('details',{className:'mw-settings-group',open:true},h('summary',null,'CLIPPING · MOL*'),h('div',{className:'mw-settings-content'},
   range('radius','Clipping',CLIPPING_PARAMS.radius),
   h('label',{className:'mw-row'},h('span',{className:'grow'},'Clip far plane'),h('input',{type:'checkbox','aria-label':'Clip far plane',checked:clipping.far,onChange:e=>apply({far:e.target.checked})})),
   h('label',{className:'mw-row'},h('span',{className:'grow'},'Minimum near plane'),h('input',{className:'mw-input',style:{width:80},type:'number','aria-label':'Minimum near plane',min:CLIPPING_PARAMS.minNear.min,max:CLIPPING_PARAMS.minNear.max,step:CLIPPING_PARAMS.minNear.step,value:clipping.minNear,onChange:e=>apply({minNear:Number(e.target.value)})})),
   range('fog','Fog intensity',{min:0,max:100,defaultValue:15,step:1}),
   h('button',{className:'mw-btn',onClick:()=>apply(DEFAULT_CLIPPING)},'Reset clipping'),h('p',{className:'mw-help'},'Official Mol* cameraClipping radius, far and minNear; cameraFog intensity. Click empty canvas to return to Overview.'))),
  h('div',{className:'mw-kicker'},'ALIGNMENT'),h('button',{className:'mw-btn',disabled:state.structures.length<2,onClick:()=>run('align',{referenceId:active?.structureId,mobileId:state.structures.find(s=>s.structureId!==active?.structureId)?.structureId})},'Align backbone to another structure'));
}
