import { StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { Loci } from 'molstar/lib/mol-model/loci';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
function residuesFromLoci(loci) {
  const out = [];
  const seen = new Set();
  try {
    const residueLoci = Loci.normalize(loci, 'residue', true);
    if (residueLoci.kind !== 'element-loci') return out;
    StructureElement.Loci.forEachLocation(residueLoci, (loc) => {
      const unit = loc.unit;
      if (!Unit.isAtomic(unit)) return;
      const h = unit.model.atomicHierarchy;
      const residueIndex = h.residueAtomSegments.index[loc.element];
      const key = `${unit.id}:${residueIndex}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ modelId: unit.model.modelNum, unitId: unit.id, operatorName: unit.conformation.operator.name, ...residueRefAt(h, residueIndex) });
    });
  } catch (err) {
    console.error('[molecular] residuesFromLoci failed', err);
  }
  return out;
}

function buildResidueLoci(structure, selection) {
  const want = selection.residues || [];
  const elements = [];
  try {
    for (const unit of structure.units) {
      if (!Unit.isAtomic(unit)) continue;
      const h = unit.model.atomicHierarchy;
      const indices = [];
      for (let ui = 0; ui < unit.elements.length; ui++) {
        const atomIndex = unit.elements[ui];
        const residueIndex = h.residueAtomSegments.index[atomIndex];
        const ref = residueRefAt(h, residueIndex);
        const hit = selection.kind === 'chain'
          ? (selection.chainIds || []).includes(ref.authAsymId)
          : want.some((w) => matchesResidue(unit, ref, w));
        if (hit) indices.push(ui);
      }
      if (indices.length) elements.push({ unit, indices: OrderedSet.ofSortedArray(indices) });
    }
  } catch (err) {
    console.error('[molecular] buildResidueLoci failed', err);
  }
  return elements.length ? StructureElement.Loci(structure, elements) : StructureElement.Loci(structure, []);
}

function matchesResidue(unit, ref, wanted) {
  return (wanted.modelId == null || wanted.modelId === 0 || wanted.modelId === unit.model.modelNum)
    && (wanted.unitId == null || wanted.unitId === unit.id)
    && (wanted.operatorName == null || wanted.operatorName === unit.conformation.operator.name)
    && (wanted.authAsymId == null || wanted.authAsymId === ref.authAsymId)
    && (wanted.labelAsymId == null || wanted.labelAsymId === ref.labelAsymId)
    && (wanted.authSeqId == null || wanted.authSeqId === ref.authSeqId)
    && (wanted.labelSeqId == null || wanted.labelSeqId === ref.labelSeqId)
    && (wanted.insCode ?? '') === (ref.insCode ?? '');
}

function buildAtomLoci(structure, selection) {
  const elements = [];
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) continue;
    const h = unit.model.atomicHierarchy;
    const indices = [];
    for (let ui = 0; ui < unit.elements.length; ui++) {
      const ai = unit.elements[ui];
      const ref = residueRefAt(h, h.residueAtomSegments.index[ai]);
      if ((selection.atoms || []).some(a => matchesResidue(unit, ref, a)
        && (a.authAtomId != null || a.labelAtomId != null)
        && (a.authAtomId == null || a.authAtomId === h.atoms.auth_atom_id.value(ai))
        && (a.labelAtomId == null || a.labelAtomId === h.atoms.label_atom_id.value(ai))
        && (a.altId == null || a.altId === h.atoms.label_alt_id.value(ai)))) indices.push(ui);
    }
    if (indices.length) elements.push({ unit, indices: OrderedSet.ofSortedArray(indices) });
  }
  return StructureElement.Loci(structure, elements);
}

// Mol* column layout: chain ids live on `chains`, comp ids on `atoms`, and the
// insertion code column is `pdbx_PDB_ins_code`. Resolve a residue's identifiers
// through the atom segmentations.
function residueRefAt(h, residueIndex) {
  const str = (v) => (v == null ? null : String(v));
  const firstAtom = h.residueAtomSegments.offsets[residueIndex];
  const chainIndex = h.chainAtomSegments.index[firstAtom];
  return {
    labelAsymId: str(h.chains.label_asym_id.value(chainIndex)),
    authAsymId: str(h.chains.auth_asym_id.value(chainIndex)),
    labelSeqId: h.residues.label_seq_id.value(residueIndex),
    authSeqId: h.residues.auth_seq_id.value(residueIndex),
    insCode: str(h.residues.pdbx_PDB_ins_code.value(residueIndex)),
    compId: str(h.atoms.auth_comp_id.value(firstAtom)),
  };
}

function extractResidues(structure) {
  const out = [];
  const seen = new Set();
  for (const unit of structure?.units ?? []) {
    try {
      if (!Unit.isAtomic(unit)) continue;
      const model = unit.model;
      const h = model.atomicHierarchy;
      for (const ai of unit.elements) {
        const ri = h.residueAtomSegments.index[ai];
        const key = `${model.id}:${ri}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ modelId: model.modelNum, ...residueRefAt(h, ri) });
      }
    } catch (err) {
      console.error('[molecular] extractResidues failed', err);
    }
  }
  return out;
}

function atomsFromLoci(loci) {
  const out = [];
  try {
    const elementLoci = Loci.normalize(loci, 'element', true);
    if (elementLoci.kind !== 'element-loci') return out;
    StructureElement.Loci.forEachLocation(elementLoci, (loc) => {
      if (out.length) return;
      const unit = loc.unit;
      if (!Unit.isAtomic(unit)) return;
      const h = unit.model.atomicHierarchy;
      const atomIndex = loc.element;
      const residueIndex = h.residueAtomSegments.index[atomIndex];
      const str = (v) => (v == null ? null : String(v));
      out.push({
        modelId: unit.model.modelNum,
        unitId: unit.id,
        operatorName: unit.conformation.operator.name,
        ...residueRefAt(h, residueIndex),
        labelAtomId: str(h.atoms.label_atom_id.value(atomIndex)),
        authAtomId: str(h.atoms.auth_atom_id.value(atomIndex)),
        element: str(h.atoms.type_symbol.value(atomIndex)),
        altId: str(h.atoms.label_alt_id.value(atomIndex)),
      });
    });
  } catch (err) {
    console.error('[molecular] atomsFromLoci failed', err);
  }
  return out;
}

function atomPosition(loc) {
  try {
    const conf = loc.unit.conformation;
    if (conf && typeof conf.position === 'function') {
      const out = Vec3();
      const r = conf.position(loc.element, out) ?? out;
      if ([r[0], r[1], r[2]].every(Number.isFinite)) return { x: r[0], y: r[1], z: r[2] };
    }
  } catch (err) {
    console.error('[molecular] conformation.position failed', err);
  }
  try {
    const conf = loc.unit.model.atomicConformation;
    const i = loc.element;
    return { x: conf.x[i], y: conf.y[i], z: conf.z[i] };
  } catch (err) {
    console.error('[molecular] atomicConformation failed', err);
    return null;
  }
}

/** Distance in Å between the first atom of each loci. */
function lociDistance(la, lb) {
  const l1 = StructureElement.Loci.getFirstLocation(la);
  const l2 = StructureElement.Loci.getFirstLocation(lb);
  if (!l1 || !l2) return null;
  const p1 = atomPosition(l1);
  const p2 = atomPosition(l2);
  if (!p1 || !p2) return null;
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}


export { residuesFromLoci, buildResidueLoci, buildAtomLoci, residueRefAt, extractResidues, atomsFromLoci, atomPosition, lociDistance };
