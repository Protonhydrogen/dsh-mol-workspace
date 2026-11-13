/** Normalized molecular selection model shared by UI actions and Agent tools. */

function asString(v) {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Normalize one residue reference; keeps both auth (PDB) and label (internal) numbering. */
export function normalizeResidue(r) {
  if (r == null || typeof r !== 'object') return null;
  return {
    modelId: asNumber(r.modelId) ?? 0,
    unitId: asNumber(r.unitId),
    operatorName: asString(r.operatorName),
    labelAsymId: asString(r.labelAsymId),
    authAsymId: asString(r.authAsymId),
    labelSeqId: asNumber(r.labelSeqId),
    authSeqId: asNumber(r.authSeqId),
    insCode: asString(r.insCode),
  };
}

/** Normalize one atom reference (a residue reference plus atom ids). */
export function normalizeAtom(a) {
  if (a == null || typeof a !== 'object') return null;
  const base = normalizeResidue(a);
  if (base === null) return null;
  return {
    ...base,
    labelAtomId: asString(a.labelAtomId),
    authAtomId: asString(a.authAtomId),
    element: asString(a.element),
    altId: typeof a.altId === 'string' ? a.altId : null,
  };
}

/** Normalize a client/tool-supplied selection into canonical plain JSON. */
export function normalizeSelection(input) {
  if (input == null || typeof input !== 'object') return null;
  const structureId = asString(input.structureId);
  const kind =
    input.kind === 'residue' || input.kind === 'chain' || input.kind === 'atom' || input.kind === 'none'
      ? input.kind
      : 'residue';
  const residues = Array.isArray(input.residues) ? input.residues.map(normalizeResidue).filter(Boolean) : [];
  const atoms = Array.isArray(input.atoms) ? input.atoms.map(normalizeAtom).filter(Boolean) : [];
  const chainIds = Array.isArray(input.chainIds) ? input.chainIds.filter((c) => typeof c === 'string' && c.length > 0) : [];
  return { structureId, kind, residues, atoms, chainIds };
}

function formatResidue(r) {
  const parts = [];
  if (r.modelId) parts.push(`model ${r.modelId}`);
  if (r.authAsymId != null) parts.push(`chain ${r.authAsymId}`);
  if (r.labelAsymId != null && r.labelAsymId !== r.authAsymId) parts.push(`[label chain ${r.labelAsymId}]`);
  if (r.authSeqId != null) parts.push(`res ${r.authSeqId}${r.insCode ?? ''}`);
  else if (r.labelSeqId != null) parts.push(`label res ${r.labelSeqId}`);
  return parts.join(' ');
}

/** Format a selection as compact, model-visible text for Add to Chat. */
export function formatSelectionForChat(sel, structureTitle) {
  if (sel == null) return '[Molecular selection] (none)';
  const lines = ['[Molecular selection]'];
  if (structureTitle) lines.push(`Structure: ${structureTitle}`);
  lines.push(`structureId: ${sel.structureId}`);
  lines.push(`kind: ${sel.kind}`);
  if (sel.chainIds.length) lines.push(`Chains (auth): ${sel.chainIds.join(', ')}`);
  if (sel.residues.length) {
    lines.push('Residues (auth PDB numbering; label numbering shown when different):');
    for (const r of sel.residues.slice(0, 200)) lines.push(`  - ${formatResidue(r)}`);
    if (sel.residues.length > 200) lines.push(`  … ${sel.residues.length - 200} more`);
  }
  if (sel.atoms.length) {
    lines.push('Atoms:');
    for (const a of sel.atoms.slice(0, 200)) lines.push(`  - ${formatResidue(a)} atom ${a.authAtomId ?? a.labelAtomId ?? '?'}`);
  }
  return lines.join('\n');
}
