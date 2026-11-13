export const ACTIONS = ['select','focus','highlight','clearSelection','setDisplay','setVisibility','camera','createTag','removeTag','createLayer','removeLayer','createMeasurement','removeMeasurement','clearMeasurements','styleMeasurement','previewImage','exportImage','exportStructure','trajectory','align','getStructureInfo','getResidues','getInteractions','getSequence','neighbors','removeStructure','hideSelection','undo'];
export const MEASUREMENTS = ['distance','angle','dihedral','label','orientation','plane'];
export const REPRESENTATION_OPTIONS=[['cartoon','Cartoon'],['ball-and-stick','Ball-and-Stick'],['molecular-surface','Molecular Surface'],['gaussian-surface','Gaussian Surface'],['spacefill','Spacefill'],['point','Point'],['line','Line'],['backbone','Backbone'],['putty','Putty'],['carbohydrate','Carbohydrate']];
export const REPRESENTATIONS = ['auto','polymer-cartoon','atomic-detail','polymer-and-ligand','illustrative',...REPRESENTATION_OPTIONS.map(([name])=>name)];
export const COLORS = ['chain-id','element-symbol','residue-name','secondary-structure','uniform','kt-ms2'];
export function failure(code, message) { return Object.assign(new Error(message), { code }); }
export function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
export function requireObject(value, label='arguments') {
  // Tool transports may deliver structured `args` as a JSON string. Accept both
  // forms here so no caller has to special-case the encoding.
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return {};
    try {
      value = JSON.parse(text);
    } catch {
      throw failure('INVALID_ARGUMENT', `${label} must be an object (received unparsable JSON string)`);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_ARGUMENT', `${label} must be an object`);
  return value;
}
export function id(prefix='item') { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`; }
export function checkColor(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw failure('INVALID_ARGUMENT','Color must be #RRGGBB');
  return Number.parseInt(color.slice(1),16);
}
export function validateDisplay(input) {
  input = requireObject(input);
  if (input.representation && !REPRESENTATIONS.includes(input.representation)) throw failure('INVALID_ARGUMENT',`Unknown representation: ${input.representation}`);
  if(input.representations!=null&&(!Array.isArray(input.representations)||input.representations.some(r=>!REPRESENTATION_OPTIONS.some(([name])=>name===r))))throw failure('INVALID_ARGUMENT','representations must be a list of supported Molstar representation names');
  if (input.color && !COLORS.includes(input.color)) throw failure('INVALID_ARGUMENT',`Unknown color theme: ${input.color}`);
  if (input.colorValue) checkColor(input.colorValue);
  if (input.opacity != null && (!Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1)) throw failure('INVALID_ARGUMENT','Opacity must be between 0 and 1');
  for(const [key,max] of [['sizeFactor',10],['emissive',1],['metalness',1],['roughness',1],['bumpiness',1],['bumpFrequency',10],['bumpAmplitude',5]])if(input[key]!=null&&(!Number.isFinite(input[key])||input[key]<0||input[key]>max))throw failure('INVALID_ARGUMENT',`${key} must be 0–${max}`);
  return clone(input);
}
