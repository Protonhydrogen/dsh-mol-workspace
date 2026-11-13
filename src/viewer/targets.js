import { StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { failure } from '../shared/model.js';
import { normalizeSelection } from '../shared/selection.js';
export const LETTERS={ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V',SEC:'U',PYL:'O',MSE:'M',ASX:'B',GLX:'Z',UNK:'X',DA:'A',DC:'C',DG:'G',DT:'T',A:'A',C:'C',G:'G',U:'U',I:'I',HOH:'~'};
export const oneLetter=name=>LETTERS[name]??'X';
export const residueKey=r=>`${r.modelId??0}:${r.labelAsymId??r.authAsymId}:${r.authSeqId??r.labelSeqId}:${r.insCode??''}`;
export function chainsOf(residues){
  const chains=new Map();for(const r of residues){const key=`${r.modelId}:${r.labelAsymId}`;if(!chains.has(key))chains.set(key,{key,modelId:r.modelId,chainId:r.authAsymId,labelChainId:r.labelAsymId,residues:[],sequence:''});const c=chains.get(key);c.residues.push(r);c.sequence+=oneLetter(r.compId);}
  return [...chains.values()].map(c=>({...c,residueCount:c.residues.length}));
}
export function resolveTarget(engine,args={},state={}){
  const sid=String(args.structureId??args.selection?.structureId??state.activeStructureId??engine.activeStructureId??'');
  if(!engine.structures.has(sid))throw failure('TARGET_NOT_FOUND',`Structure ${sid||'(none)'} is not loaded`);
  let selection;
  if(args.selection)selection=normalizeSelection({...args.selection,structureId:sid});
  else if(args.start!=null||args.end!=null||args.chainId!=null||args.atomName){
    if(args.start!=null&&!Number.isFinite(Number(args.start))||args.end!=null&&!Number.isFinite(Number(args.end)))throw failure('INVALID_ARGUMENT','Residue bounds must be numeric');
    const rs=(engine.residues.get(sid)??[]).filter(r=>(args.chainId==null||r.authAsymId===args.chainId||r.labelAsymId===args.chainId)&&(args.modelId==null||r.modelId===args.modelId)&&(args.start==null||r.authSeqId>=Number(args.start))&&((args.end??args.start)==null||r.authSeqId<=Number(args.end??args.start)));
    selection=normalizeSelection({structureId:sid,kind:args.atomName?'atom':'residue',residues:args.atomName?[]:rs,atoms:args.atomName?rs.map(r=>({...r,authAtomId:args.atomName,...(args.altId!=null?{altId:args.altId}:{})})):[]});
  }else if(state.selection?.structureId===sid&&state.selection.kind!=='none')selection=normalizeSelection(state.selection);
  else selection=normalizeSelection({structureId:sid,kind:'chain',chainIds:chainsOf(engine.residues.get(sid)??[]).map(c=>c.chainId)});
  const loci=engine.lociFor(selection);
  if(!loci||StructureElement.Loci.isEmpty(loci))throw failure('TARGET_NOT_FOUND','The requested chain, residue or atom does not exist');
  return selection;
}
