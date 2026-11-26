import {StructureElement} from 'molstar/lib/mol-model/structure';
import {setStructureTransparency,clearStructureTransparency} from 'molstar/lib/mol-plugin-state/helpers/structure-transparency';
export async function syncHidden(e,state){
 const selections=state.hiddenSelections??[];
 for(const ref of state.structures){
  const node=e.structureNode(ref.structureId);if(!node)continue;const components=node.components??[];
  const hidden=selections.filter(s=>s.structureId===ref.structureId),key=JSON.stringify({hidden,representations:components.flatMap(c=>c.representations.map(r=>r.cell.transform.ref))});
  if(e.hiddenCache?.get(ref.structureId)===key)continue;
  await clearStructureTransparency(e.plugin,components);
  for(const selection of hidden){const loci=e.lociFor(selection);if(!loci||StructureElement.Loci.isEmpty(loci))continue;await setStructureTransparency(e.plugin,components,1,root=>StructureElement.Loci.remap(loci,root));}
  if(!e.hiddenCache)e.hiddenCache=new Map();e.hiddenCache.set(ref.structureId,key);
 }
}
