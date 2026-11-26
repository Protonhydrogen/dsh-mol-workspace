import {StructureElement,StructureProperties,Unit} from 'molstar/lib/mol-model/structure';
import {SecondaryStructureType} from 'molstar/lib/mol-model/structure/model/types';
import {SecondaryStructureProvider} from 'molstar/lib/mol-model-props/computed/secondary-structure';
import {Task} from 'molstar/lib/mol-task';
import {OrderedSet} from 'molstar/lib/mol-data/int';
import {atomPosition,atomsFromLoci,residuesFromLoci} from './selection.js';
import {failure} from '../shared/model.js';
export async function inspectTarget(e,args,state){
 const selection=e.resolveTarget(args,state),loci=e.lociFor(selection),structure=e.structures.get(selection.structureId);
 const cap=Number(args.maxAtoms??200);if(!Number.isInteger(cap)||cap<1||cap>2000)throw failure('INVALID_ARGUMENT','maxAtoms must be an integer from 1 to 2000');
 const task=Task.create('Read molecular properties',runtime=>SecondaryStructureProvider.attach({runtime,assetManager:e.plugin?.managers.asset},structure));
 if(e.plugin?.runTask)await e.plugin.runTask(task);else await task.run();
 const atoms=[],residues=new Map();let count=0;
 StructureElement.Loci.forEachLocation(loci,loc=>{
  if(!Unit.isAtomic(loc.unit))return;count++;
  const h=loc.unit.model.atomicHierarchy,ri=loc.unit.residueIndex[loc.element],key=`${loc.unit.id}:${ri}`;
  const single=StructureElement.Loci(structure,[{unit:loc.unit,indices:OrderedSet.ofSingleton(OrderedSet.indexOf(loc.unit.elements,loc.element))}]);
  const flag=StructureProperties.residue.secondary_structure_type(loc);
  const ss=flag&SecondaryStructureType.Flag.Helix?'H':flag&SecondaryStructureType.Flag.Beta?'E':flag===SecondaryStructureType.Flag.NA?'unknown':'C';
  if(!residues.has(key))residues.set(key,{...residuesFromLoci(single)[0],secondaryStructure:ss,secondaryStructureFlags:flag,atomCount:0});residues.get(key).atomCount++;
  if(atoms.length<cap){const xyz=atomPosition(loc);atoms.push({...atomsFromLoci(single)[0],position:xyz?[xyz.x,xyz.y,xyz.z]:null,occupancy:StructureProperties.atom.occupancy(loc),bFactor:StructureProperties.atom.B_iso_or_equiv(loc),formalCharge:h.atoms.pdbx_formal_charge.valueKind(loc.element)===0?StructureProperties.atom.pdbx_formal_charge(loc):null});}
 });
 return {value:{structureId:selection.structureId,selection,atomCount:count,residueCount:residues.size,residues:[...residues.values()],atoms,truncated:count>atoms.length,secondaryStructureMethod:'Molstar automatic: file annotation or DSSP; unknown is not assigned'},patch:{}};
}
