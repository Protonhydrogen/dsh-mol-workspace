import { CHAIN_COLOR_PARAMS, NEUTRAL_CARBON, carbonColor } from './palette.js';
export const presetRepresentation=name=>({'auto':'cartoon','polymer-cartoon':'cartoon','atomic-detail':'ball-and-stick','polymer-and-ligand':'ball-and-stick','illustrative':'spacefill'}[name]??name??'cartoon');
export function selectedRepresentations(display){return display.representations??[presetRepresentation(display.representation)];}
export function representationColorParams(display){
 if(display.color==='chain-id')return CHAIN_COLOR_PARAMS;
 if(display.color==='element-symbol')return carbonColor(NEUTRAL_CARBON);
 return display.colorValue?{value:Number.parseInt(display.colorValue.slice(1),16)}:{};
}
export function representationParams(display,previous={}){
 const params={...previous,alpha:display.opacity??1,quality:display.quality??'auto',emissive:display.emissive??0,
  material:{...previous.material,metalness:display.metalness??0,roughness:display.roughness??.4,bumpiness:display.bumpiness??0}};
 for(const key of ['sizeFactor','flatShaded','bumpFrequency','bumpAmplitude','ignoreHydrogens','tubularHelices','aspectRatio','arrowFactor'])if(display[key]!=null)params[key]=display[key];
 return params;
}
