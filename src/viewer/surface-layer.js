import { OrderedSet } from 'molstar/lib/mol-data/int';
import { isPositionLocation } from 'molstar/lib/mol-geo/util/location-iterator.js';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';
import { ColorThemeCategory } from 'molstar/lib/mol-theme/color/categories.js';
import { PhysicalSizeTheme } from 'molstar/lib/mol-theme/size/physical.js';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition.js';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { clone, failure, id, SURFACE_KINDS, validateDisplay } from '../shared/model.js';
import { makeRegionTest, parsePotentialGrid, potentialColor, screenedPotential } from './surface-potential.js';

const COLOR_THEME = 'workspace-electrostatic-potential';
const SIZE_THEME = 'workspace-solvent-accessible-radius';
const NEUTRAL = 0xb3bac5;
const CHARGED_GROUPS = {
  ASP: { charge: -1, sites: ['OD1', 'OD2'] },
  GLU: { charge: -1, sites: ['OE1', 'OE2'] },
  LYS: { charge: 1, sites: ['NZ'] },
  ARG: { charge: 1, sites: ['NH1', 'NH2'] },
};
const colors = ['uniform', 'chain-id', 'residue-name', 'element-symbol', 'hydrophobicity', 'electrostatic'];

export function registerSurfaceThemes(engine, plugin) {
  engine.surfaceFields = new Map();
  const colorParams = { field: PD.Text('') };
  function colorFactory(_ctx, props) {
    const field = engine.surfaceFields.get(props.field);
    return {
      factory: colorFactory, props, granularity: 'vertex',
      color: location => field && isPositionLocation(location) ? field(location.position) : NEUTRAL,
    };
  }
  plugin.representation.structure.themes.colorThemeRegistry.add({
    name: COLOR_THEME, label: 'Electrostatic Potential', category: ColorThemeCategory.Misc,
    factory: colorFactory, getParams: () => colorParams,
    defaultValues: PD.getDefaultValues(colorParams), isApplicable: ctx => !!ctx.structure,
  });
  const sizeParams = { probe: PD.Numeric(1.4, { min: 0, max: 3 }) };
  function sizeFactory(ctx, props) {
    const physical = PhysicalSizeTheme(ctx, { scale: 1 });
    return { factory: sizeFactory, props, granularity: 'group', size: location => physical.size(location) + props.probe };
  }
  plugin.representation.structure.themes.sizeThemeRegistry.add({
    name: SIZE_THEME, label: 'Solvent-accessible radius', category: '',
    factory: sizeFactory, getParams: () => sizeParams,
    defaultValues: PD.getDefaultValues(sizeParams), isApplicable: ctx => !!ctx.structure,
  });
}

function sceneAtoms(structure) {
  const groups = [];
  for (const unit of structure.units) {
    if (!Unit.isAtomic(unit)) continue;
    const indices = [];
    const location = StructureElement.Location.create(structure, unit);
    for (let i = 0; i < unit.elements.length; i++) {
      location.element = unit.elements[i];
      if (StructureProperties.entity.type(location) !== 'water') indices.push(i);
    }
    if (indices.length) groups.push({ unit, indices: OrderedSet.ofSortedArray(indices) });
  }
  return StructureElement.Loci(structure, groups);
}

function chargedProteinSites(loci) {
  const groups = new Map();
  const position = Vec3();
  StructureElement.Loci.forEachLocation(loci, location => {
    const { unit, element } = location;
    const h = unit.model.atomicHierarchy;
    const site = h.atoms.label_atom_id.value(element);
    const group = CHARGED_GROUPS[h.atoms.label_comp_id.value(element)];
    if (!group?.sites.includes(site)) return;
    const key = unit.id + ':' + h.residueAtomSegments.index[element];
    let entry = groups.get(key);
    if (!entry) groups.set(key, entry = { charge: group.charge, sites: new Map() });
    const occupancy = unit.model.atomicConformation.occupancy.value(element);
    if ((entry.sites.get(site)?.occupancy ?? -1) >= occupancy) return;
    unit.conformation.position(element, position);
    entry.sites.set(site, { position: Array.from(position), occupancy });
  });
  return [...groups.values()].flatMap(({ charge, sites }) =>
    [...sites.values()].map(({ position }) => [...position, charge / sites.size]));
}

function sitePositions(engine, selection) {
  const positions = [];
  const point = Vec3();
  StructureElement.Loci.forEachLocation(engine.lociFor(selection), ({ unit, element }) => {
    if (!Unit.isAtomic(unit) || unit.model.atomicHierarchy.atoms.type_symbol.value(element) === 'H') return;
    unit.conformation.position(element, point);
    positions.push(Array.from(point));
  });
  if (!positions.length) throw failure('TARGET_NOT_FOUND', 'The requested site has no usable heavy atom coordinates');
  return positions;
}

export function resolveSurfaceSite(engine, structureId, residues) {
  if (!Array.isArray(residues) || !residues.length || residues.length > 200) {
    throw failure('INVALID_ARGUMENT', 'Provide 1–200 exact site residues');
  }
  for (const residue of residues) {
    if (!residue || !(residue.authAsymId || residue.labelAsymId) ||
        !(Number.isInteger(residue.authSeqId) || Number.isInteger(residue.labelSeqId))) {
      throw failure('INVALID_ARGUMENT', 'Each site residue needs an auth or label chain ID and integer residue number');
    }
    // Validate each residue so one successful match cannot hide an absent target.
    engine.resolveTarget({ structureId, selection: { kind: 'residue', residues: [residue] } }, {});
  }
  return engine.resolveTarget({ structureId, selection: { kind: 'residue', residues } }, {});
}

function assertGridFrame(engine, sid, state) {
  if (engine.trajectories.get(sid)?.frame || state.camera?.alignment?.mobileId === sid) {
    throw failure('INVALID_ARGUMENT', 'OpenDX uses the original structure coordinates. Reset to frame 1 and use the unaligned structure.');
  }
}

export function buildSurfaceRecord(engine, sid, args, state) {
  const kind = args.surface ?? 'molecular';
  const color = args.color ?? (args.dxPath || args.residues || args.radius != null ? 'electrostatic' : args.colorValue ? 'uniform' : 'chain-id');
  if (!SURFACE_KINDS.includes(kind) || !colors.includes(color)) throw failure('INVALID_ARGUMENT', 'Unknown surface type or color theme');
  const structure = engine.structures.get(sid);
  if (!structure) throw failure('TARGET_NOT_FOUND', 'Load a structure before rendering a surface');
  const opacity = args.opacity ?? 0.94;
  validateDisplay({ opacity, colorValue: args.colorValue });
  const electrostatic = color === 'electrostatic';
  if (!electrostatic && (args.dxPath != null || args.residues != null || args.radius != null || args.limit != null)) {
    throw failure('INVALID_ARGUMENT', 'Grid, site, radius and scale require electrostatic coloring');
  }
  if (args.radius != null && args.residues == null) throw failure('INVALID_ARGUMENT', 'A local radius requires site residues');
  const site = args.residues == null ? null : resolveSurfaceSite(engine, sid, args.residues);
  const radius = site ? (args.radius ?? 6) : null;
  if (site && (!Number.isFinite(radius) || radius < 1 || radius > 30)) throw failure('INVALID_ARGUMENT', 'Site radius must be 1–30 Å');
  if (args.dxPath != null && (typeof args.dxPath !== 'string' || !/\.dx$/i.test(args.dxPath))) {
    throw failure('INVALID_ARGUMENT', 'Use an uncompressed .dx potential map');
  }
  const grid = args.dxPath != null;
  if (grid) assertGridFrame(engine, sid, state);
  const limit = electrostatic ? (args.limit ?? (grid ? 5 : 0.25)) : null;
  if (electrostatic && (!Number.isFinite(limit) || limit <= 0)) throw failure('INVALID_ARGUMENT', 'Color range must be positive');
  if (args.name != null && typeof args.name !== 'string') throw failure('INVALID_ARGUMENT', 'Layer name must be text');
  const name = (args.name ?? (electrostatic ? (grid ? 'Electrostatic potential (OpenDX)' : 'Electrostatic potential (approx.)') : kind + ' surface')).trim();
  if (!name || name.length > 120) throw failure('INVALID_ARGUMENT', 'Layer name must be 1–120 characters');
  const surface = { kind, color, opacity, ...(args.colorValue ? { colorValue: args.colorValue } : {}), site, radius, limit };
  if (electrostatic) surface.method = grid ? 'opendx-trilinear' : 'screened-protein-side-chains';
  if (grid) surface.dxPath = args.dxPath;
  const chainIds = [...new Set((engine.residues.get(sid) ?? []).map(r => r.authAsymId))].filter(Boolean);
  const selection = site ?? { structureId: sid, kind: 'chain', chainIds };
  return { id: id('surface'), name, selection, surface, visible: true };
}

export async function createSurfaceVisual(engine, record, state) {
  const { surface, id: key } = record;
  const sid = record.selection.structureId;
  const structure = engine.structures.get(sid);
  const loci = sceneAtoms(structure);
  if (StructureElement.Loci.isEmpty(loci)) throw failure('TARGET_NOT_FOUND', 'The structure has no surface atoms');
  const gaussian = surface.kind === 'gaussian';
  const accessible = surface.kind === 'solvent-accessible';
  const type = gaussian ? 'gaussian-surface' : 'molecular-surface';
  const typeParams = {
    alpha: surface.opacity, ignoreHydrogens: true,
    visuals: [gaussian ? 'structure-gaussian-surface-mesh' : 'structure-molecular-surface-mesh'],
    ...(gaussian ? { tryUseGpu: false } : { probeRadius: accessible || surface.kind === 'van-der-waals' ? 0 : 1.4 }),
    smoothColors: { name: 'off', params: {} },
  };
  let component, inRegion = 0, sampled = 0, warnings = [], fieldSource;
  try {
    if (surface.method) {
      let sample;
      if (surface.method === 'opendx-trilinear') {
        assertGridFrame(engine, sid, state);
        const grid = await engine.readPotentialGrid(surface.dxPath);
        if (surface.gridHash != null && grid.hash !== surface.gridHash) throw failure('VERSION_CONFLICT', 'OpenDX file changed. Render a new layer to use the updated map.');
        const parsed = parsePotentialGrid(grid.text);
        surface.gridHash = grid.hash;
        sample = parsed.sample;
        fieldSource = { method: surface.method, path: surface.dxPath, sha256: grid.hash, gridCounts: parsed.counts, units: 'kT/e (APBS potential maps)' };
      } else {
        const sites = chargedProteinSites(loci);
        if (!sites.length) throw failure('TARGET_NOT_FOUND', 'No modeled charged protein side-chain sites found. Supply a coordinate-matched OpenDX potential map.');
        sample = screenedPotential(sites, 8);
        fieldSource = { method: surface.method, units: 'reduced preview units', screeningLengthAngstrom: 8, chargedAtomCount: sites.length };
        warnings.push('Approximate side-chain preview only. Omits termini, histidine protonation, ligands, nucleic acids, and dielectric boundaries.');
      }
      const inside = surface.site ? makeRegionTest(sitePositions(engine, surface.site), surface.radius) : null;
      engine.surfaceFields.set(key, ([x, y, z]) => {
        if (inside && !inside(x, y, z)) return NEUTRAL;
        inRegion++;
        const value = sample(x, y, z);
        if (!Number.isFinite(value)) return NEUTRAL;
        sampled++;
        return potentialColor(value, surface.limit);
      });
    }
    const node = engine.structureNode(sid);
    const parent = node?.transform?.cell.transform.ref ?? engine.structureRefs.get(sid);
    component = await engine.plugin.builders.structure.tryCreateComponent(parent, {
      type: { name: 'bundle', params: StructureElement.Bundle.fromLoci(loci) },
      nullIfEmpty: true, label: record.name,
    }, key);
    if (!component?.obj) throw failure('EXECUTION_FAILED', 'Surface component could not be created');
    const visual = await engine.plugin.builders.structure.representation.addRepresentation(component, {
      type, typeParams,
      color: surface.method ? COLOR_THEME : surface.color,
      colorParams: surface.method ? { field: key } : surface.color === 'uniform' ? { value: parseInt((surface.colorValue ?? '#b3bac5').slice(1), 16) } : {},
      ...(accessible ? { size: SIZE_THEME, sizeParams: { probe: 1.4 } } : {}),
    });
    if (!visual?.obj?.data?.repr?.renderObjects?.length) throw failure('EXECUTION_FAILED', 'Mol* did not create a surface mesh');
    if (surface.method && !sampled) throw failure('TARGET_NOT_FOUND', inRegion ? 'The OpenDX map does not cover the requested surface. Check coordinate alignment.' : 'The specified residues have no surface within the requested radius.');
    if (sampled < inRegion) warnings.push('Surface samples outside the OpenDX map are shown in gray. Check map coverage and coordinate alignment.');
    const hidden = record.visible === false || state.structures.find(s => s.structureId === sid)?.display?.visible === false;
    setSubtreeVisibility(engine.plugin.state.data, component.ref, hidden);
    engine.layerItems.set(key, { ref: component.ref, record: clone(record), signature: JSON.stringify(record), structure });
    return {
      layerId: key, structureId: sid, name: record.name, surface: surface.kind, visible: !hidden,
      ...(fieldSource ? { field: fieldSource, site: surface.site, radiusAngstrom: surface.radius,
        scale: { negative: -surface.limit, neutral: 0, positive: surface.limit, colors: ['red', 'white', 'blue'] },
        sampledSurfaceVertices: sampled, regionSurfaceVertices: inRegion, warnings } : {}),
    };
  } catch (error) {
    if (component && engine.plugin.state.data.cells.has(component.ref)) await engine.plugin.state.data.build().delete(component.ref).commit();
    engine.surfaceFields.delete(key);
    throw error;
  }
}
