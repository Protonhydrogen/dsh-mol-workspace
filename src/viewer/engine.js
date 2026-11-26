import * as React from 'react';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { DefaultPluginSpec } from 'molstar/lib/mol-plugin/spec';
import { StructureElement, Unit } from 'molstar/lib/mol-model/structure';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation.js';
import { Loci } from 'molstar/lib/mol-model/loci';
import { PresetStructureRepresentations } from 'molstar/lib/mol-plugin-state/builder/structure/representation-preset';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';

import { residuesFromLoci, atomsFromLoci, extractResidues, buildResidueLoci, buildAtomLoci, lociDistance } from './selection.js';
import {syncHidden} from './hidden.js';
import { syncFocus } from './focus.js';
import {applyClipping,DEFAULT_CLIPPING} from './view-settings.js';
import {MARKER_PROPS,MARKING_PROPS,carbonColor} from './palette.js';
import { canvasBackground } from '../shared/theme.js';
import { restoreView } from './output.js';
import { executeOperation, syncObjects } from './operations.js';
import { failure, clone, validateDisplay,REPRESENTATION_OPTIONS } from '../shared/model.js';
import {representationParams,representationColorParams,presetRepresentation} from './representation-style.js';
import { chainsOf, resolveTarget } from './targets.js';
import { registerSurfaceThemes } from './surface-layer.js';
import { registerKtTheme } from './kt-theme.js';
import { registerElectrostaticTheme, assignCharges, computePotentials, setActivePotential, potentialStats } from './electrostatics.js';
const KT_FOCUS_CARBON=0xe2a98f;   // 与蓝白红色带的暖端一致
const KT_CONTEXT_CARBON=0xc9d0d9; // 冷中性灰，退到背景
const FOCUS_MS=420;
const OVERVIEW_MS=640;
export class MolEngine {
  constructor() {
    this.plugin = null;
    this.structures = new Map();
    this.residues = new Map();
    this.sources = new Map();
    this.models = new Map();
    this.trajectories = new Map();
    this.layerItems = new Map();
    this.measurementItems = new Map();
    this.displayCache = new Map();
    this.stateCache = {};
    this.structureRefs = new Map();
    this.loading = new Map();
    this.displayQueue = Promise.resolve();
    this.measurements = new Set();
    this.measureVersion = 0;
    this.activeStructureId = null;
    this.disposed = false;
    this.onPick = null;
    this.clickSub = null;
  }

  async mount(container) {
    const spec = DefaultPluginSpec();
    // Plain clicks belong to this viewer's selection/measurement controls.
    // Mol* defaults also focus the residue and move the camera on each click.
    spec.behaviors = spec.behaviors.filter(b => b.transformer.id !== 'ms-plugin.camera-focus-loci');
    // Harmonise the click-to-focus detail with the workspace palette: Mol* colours
    // focused carbons green by default, which clashes with the soft blue/white/coral
    // surface. Both the focused residue and its 5 A context get explicit carbons.
    for (const b of spec.behaviors) {
      if (b.transformer !== StructureFocusRepresentation) continue;
      b.defaultParams = {
        ...(b.defaultParams || {}),
        targetParams: { color: 'element-symbol', colorParams: carbonColor(KT_FOCUS_CARBON) },
        surroundingsParams: { color: 'element-symbol', colorParams: carbonColor(KT_CONTEXT_CARBON) },
      };
    }
    const plugin = new PluginContext(spec);
    await plugin.init();
    registerKtTheme(plugin);
    registerSurfaceThemes(this, plugin);
    registerElectrostaticTheme(plugin);
    this.plugin = plugin;
    await plugin.mountAsync(container);
    this.resizeObserver=new ResizeObserver(()=>plugin.handleResize());this.resizeObserver.observe(container);
    plugin.canvas3d.setProps({renderer:{backgroundColor:0x0b0c10,...MARKER_PROPS},marking:MARKING_PROPS});
    this.clickSub = plugin.behaviors.interaction.click.subscribe((ev) => {
      if (ev.button !== 1 && ev.button !== 2) return;
      const loci = ev.current?.loci;
      if (!loci || Loci.isEmpty(loci)) { if(ev.button===1)this.onClear?.();return; }
      const normalized = Loci.normalize(loci, 'element', true);
      if (normalized.kind !== 'element-loci') return;
      const structureId = [...this.structures].find(([, s]) => s.root === normalized.structure.root)?.[0];
      if (structureId == null) return;
      const residues = residuesFromLoci(loci);
      const atoms = atomsFromLoci(loci);
      if (this.onPick && (residues.length || atoms.length)) this.onPick(residues, atoms, structureId, {button:ev.button,modifiers:ev.modifiers,position:ev.position});
    });
    return plugin;
  }

  load(structureId, data, format, title) {
    if (this.structures.has(structureId)) {
      const structure = this.structures.get(structureId);
      return Promise.resolve({ structure, residues: extractResidues(structure) });
    }
    if (this.loading.has(structureId)) return this.loading.get(structureId);
    const task = this.displayQueue.then(() => this.loadStructure(structureId, data, format, title));
    this.displayQueue = task.catch(() => {});
    this.loading.set(structureId, task);
    task.then(() => this.loading.delete(structureId), () => this.loading.delete(structureId));
    return task;
  }

  async loadStructure(structureId, data, format, title) {
    if (this.disposed) return { residues: [] };
    const parsed = await this.plugin.builders.data.rawData({ data, label: title });
    const trajectory = await this.plugin.builders.structure.parseTrajectory(parsed, format);
    const result = await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    const selector = result?.structureProperties?.obj ? result.structureProperties : result?.structure;
    const structure = selector?.obj?.data;
    if (!structure) throw new Error(`No structure produced for ${title}`);
    this.structures.set(structureId, structure);
    this.structureRefs.set(structureId, selector.ref);
    this.residues.set(structureId,extractResidues(structure));
    this.sources.set(structureId,{data,format,title});
    this.models.set(structureId,result.model.ref);
    this.trajectories.set(structureId,{ref:trajectory.ref,frameCount:trajectory.obj?.data?.frameCount??1,frame:0});
    return { structure, residues: this.residues.get(structureId) };
  }

  lociFor(selection) {
    const structure = selection?.structureId != null ? this.structures.get(selection.structureId) : undefined;
    if (!structure) return undefined;
    return selection.kind === 'atom' ? buildAtomLoci(structure, selection) : buildResidueLoci(structure, selection);
  }

  select(selection) {
    const loci = this.lociFor(selection);
    if (loci) this.plugin.managers.interactivity.lociSelects.selectOnly({ loci }, false);
    return !!loci;
  }

  setTheme(scheme,display){this.theme=scheme;const color=canvasBackground(scheme,display);this.plugin?.canvas3d?.setProps({renderer:{...MARKER_PROPS,backgroundColor:parseInt(color.slice(1),16)},marking:MARKING_PROPS});}

  setGranularity(grain) {
    this.plugin?.managers.interactivity.setProps({ granularity: grain === 'atom' ? 'element' : 'residue' });
  }

  /**
   * Ensure a potential table exists for this structure and make it the one the
   * colour theme reads. Cached per (structure, dielectric, ionic strength): the
   * O(N²) sum is paid once, not on every repaint or theme update.
   */
  ensurePotential(structureId, display = {}) {
    const structure = this.structures.get(structureId);
    if (!structure) return null;
    const model = structure.models[0];
    if (!model) return null;
    const dielectric = Number.isFinite(display.dielectric) ? display.dielectric : 80;
    const ionicStrength = Number.isFinite(display.ionicStrength) ? display.ionicStrength : 0.15;
    this.potentialCache ??= new Map();
    const key = `${structureId}|${dielectric}|${ionicStrength}`;
    let entry = this.potentialCache.get(key);
    if (!entry) {
      const assigned = assignCharges(model);
      const potential = computePotentials(model, assigned, { dielectric, ionicStrength });
      entry = {
        potential,
        stats: potentialStats(potential),
        source: assigned.source,
        netCharge: assigned.net,
      };
      this.potentialCache.set(key, entry);
    }
    setActivePotential(model, entry.potential, display.potentialRange ?? 15);
    return entry;
  }

  structureNode(structureId) {
    const structure = this.structures.get(structureId);
    const ref = this.structureRefs.get(structureId);
    return this.plugin.managers.structure.hierarchy.current.structures.find(s =>
      s.cell.transform.ref === ref || s.properties?.cell.transform.ref === ref || s.transform?.cell.transform.ref === ref || s.cell.obj?.data === structure);
  }

  setActiveStructure(structureId, focus = false) {
    if (this.activeStructureId !== structureId) {
      this.plugin.managers.interactivity.lociSelects.deselectAll();
      this.plugin.managers.interactivity.lociHighlights.clearHighlights();
    }
    this.activeStructureId = structureId;
    const structure = this.structures.get(structureId);
    if (focus && structure) {
      this.plugin.managers.camera.focusLoci(StructureElement.Loci.all(structure));
    }
  }

  pointLoci(selection) {
    const loci = this.lociFor(selection);
    if (!loci || StructureElement.Loci.isEmpty(loci)) return null;
    if (selection.kind === 'atom') return StructureElement.Loci.firstElement(loci);
    let preferred;
    StructureElement.Loci.forEachLocation(loci, loc => {
      const atomName = loc.unit.model.atomicHierarchy.atoms.label_atom_id.value(loc.element);
      if (!preferred && (atomName === 'CA' || atomName === 'P')) {
        preferred = StructureElement.Loci(loci.structure, [{ unit: loc.unit, indices: OrderedSet.ofSingleton(OrderedSet.indexOf(loc.unit.elements, loc.element)) }]);
      }
    });
    return preferred ?? StructureElement.Loci.firstElement(loci);
  }

  async focus(selection) {
    const loci = this.lociFor(selection);
    if (loci){
      this.viewToken=(this.viewToken??0)+1;
      if(!this.stateCache.camera?.clipping)applyClipping(this,{...DEFAULT_CLIPPING,far:false});
      this.plugin.managers.camera.focusLoci(loci,{extraRadius:8,minRadius:8,optimizeDirection:true,durationMs:FOCUS_MS});
      await syncFocus(this,selection);
    }
    return !!loci;
  }

  async overview(){
    // Pull the camera back first and keep the local detail on screen until the
    // move has finished: otherwise the click looks like a cut to a new scene.
    const token=(this.viewToken=(this.viewToken??0)+1);
    this.plugin.managers.interactivity.lociSelects.deselectAll();
    this.plugin.managers.interactivity.lociHighlights.clearHighlights();
    const canvas=this.plugin.canvas3d;canvas.commit(true);const sphere=canvas.boundingSphereVisible;
    if(sphere?.radius>0)canvas.camera.setState(canvas.camera.getFocus(sphere.center,sphere.radius),OVERVIEW_MS);
    else this.plugin.managers.camera.reset(undefined,OVERVIEW_MS);
    await new Promise(resolve=>setTimeout(resolve,OVERVIEW_MS+40));
    if(token!==this.viewToken)return;
    await syncFocus(this,null);
    applyClipping(this,DEFAULT_CLIPPING);
  }

  highlight(selection) {
    const loci = this.lociFor(selection);
    if (loci) this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci }, true);
    return !!loci;
  }

  /** Draw a distance measurement in the viewport; returns the value in Å. */
  async measure(a, b) {
    const version = this.measureVersion;
    const la = this.pointLoci(a);
    const lb = this.pointLoci(b);
    if (!la || !lb) throw new Error('Measurement endpoint could not be resolved');
    const distance = lociDistance(la, lb);
    if (!Number.isFinite(distance)) throw new Error('Measurement coordinates are invalid');
    const result = await this.plugin.managers.structure.measurement.addDistance(la, lb);
    if (!result?.selection?.ref) throw new Error('Mol* did not create the distance measurement');
    if (this.disposed) return null;
    if (version !== this.measureVersion) {
      await this.plugin.state.data.build().delete(result.selection.ref).commit();
      return null;
    }
    this.measurements.add(result.selection.ref);
    return distance;
  }

  async clearMeasurements() {
    this.measureVersion++;
    if (!this.plugin || !this.measurements.size) return;
    const update = this.plugin.state.data.build();
    for (const ref of this.measurements) update.delete(ref);
    this.measurements.clear();
    await update.commit();
  }

  /** Apply representation preset + colour theme + visibility. */
  applyDisplay(structureId, display, previous) {
    const task = this.displayQueue.then(async () => {
      if (this.disposed || !display) return;
      const node = this.structureNode(structureId);
      if (!node) throw new Error(`Structure ${structureId} has not loaded`);
      const mgr = this.plugin.managers.structure.component;
      validateDisplay(display);
      if (display.color === 'electrostatic') this.ensurePotential(structureId, display);
      const direct=REPRESENTATION_OPTIONS.some(([name])=>name===display.representation);
      const representation = display.representation === 'default' ? 'auto' : display.representation;
      const previousRepresentation = previous?.representation === 'default' ? 'auto' : previous?.representation;
      if (JSON.stringify(display.representations)!==JSON.stringify(previous?.representations)||representation && representation !== previousRepresentation) {
        if(display.representations||direct){
          await mgr.clearComponents([node]);
          const c=await this.plugin.builders.structure.tryCreateComponentStatic(node.cell,'all');
          for(const rawType of display.representations??[representation]){
            const type=presetRepresentation(rawType);
            const color=display.color??'chain-id';
            try{
              await this.plugin.builders.structure.representation.addRepresentation(c,{type,color,colorParams:representationColorParams(display),typeParams:representationParams(display,{},type)});
            }catch(err){
              // Never leave the viewer blank because a custom colour theme failed:
              // fall back to the built-in chain colouring and surface the error.
              if(color==='chain-id')throw err;
              console.error('[molecular] colour theme "'+color+'" failed, falling back to chain-id',err);
              await this.plugin.builders.structure.representation.addRepresentation(c,{type,color:'chain-id',colorParams:{},typeParams:representationParams(display,{},type)});
            }
          }
        }else{
          const provider = PresetStructureRepresentations[representation];
          if (!provider) throw new Error(`Unknown representation preset: ${representation}`);
          await mgr.applyPreset([node], provider);
        }
        this.layerItems.forEach((item,key)=>{if(item.record.selection.structureId===structureId){this.layerItems.delete(key);this.surfaceFields?.delete(key);}});
      }
      const custom=new Set([...this.layerItems.values()].map(v=>v.ref).concat(this.focusItems??[]));
      const components = (this.structureNode(structureId)?.components ?? []).filter(c=>!custom.has(c.cell.transform.ref));
      if (display.color && components.length) await mgr.updateRepresentationsTheme(components, { color: display.color,colorParams:representationColorParams(display) });
      if(components.length){
        const update=this.plugin.state.data.build();
        for(const c of components)for(const r of c.representations)update.to(r.cell).update(old=>({...old,type:{...old.type,params:representationParams(display,old.type.params,old.type.name)}}));
        await update.commit();
      }
      if(display.background)this.plugin.canvas3d.setProps({renderer:{...MARKER_PROPS,backgroundColor:parseInt(display.background.slice(1),16)}});
      setSubtreeVisibility(this.plugin.state.data,node.cell.transform.ref,display.visible===false);
    });
    this.displayQueue = task.catch(() => {});
    return task;
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.measureVersion++;
    if (this.clickSub) { this.clickSub.unsubscribe(); this.clickSub = null; }
    if (this.plugin) { this.plugin.dispose(); this.plugin = null; }
    this.structures.clear();
    this.structureRefs.clear();
    this.surfaceFields?.clear();
    clearInterval(this.playTimer);
  }

  resolveTarget(args,state){return resolveTarget(this,args,state);}
  async execute(command,state){return executeOperation(this,command,state);}
  metadata(structureId){
    const s=this.structures.get(structureId),residues=this.residues.get(structureId)??[];
    return {structureId,atomCount:s?.elementCount??0,residueCount:residues.length,chainCount:chainsOf(residues).length,modelCount:s?.models?.length??0,frameCount:this.trajectories.get(structureId)?.frameCount??1,chains:chainsOf(residues).map(({residues,...chain})=>chain)};
  }
  async sync(state){
    this.stateCache=state;
    for(const [sid] of this.structures)if(!state.structures.some(s=>s.structureId===sid)){
      const node=this.structureNode(sid);if(node)await this.plugin.state.data.build().delete(node.cell.transform.ref).commit();
      for(const map of [this.structures,this.residues,this.sources,this.models,this.trajectories,this.structureRefs,this.displayCache])map.delete(sid);
    }
    await restoreView(this,state);
    for(const s of state.structures){
      if(!this.structures.has(s.structureId))continue;
      const display=s.display??{representation:'auto',color:'chain-id'};
      if(JSON.stringify(this.displayCache.get(s.structureId))!==JSON.stringify(display)){
        await this.applyDisplay(s.structureId,display,this.displayCache.get(s.structureId));this.displayCache.set(s.structureId,clone(display));
      }
    }
    this.setActiveStructure(state.activeStructureId??state.structures[0]?.structureId??null);
    if(JSON.stringify(this.appliedSelection)!==JSON.stringify(state.selection)){
      if(state.selection)this.select(state.selection);else this.plugin.managers.interactivity.lociSelects.deselectAll();
      this.appliedSelection=clone(state.selection);
    }
    await syncObjects(this,state);
    await syncFocus(this,state.focus??state.selection);
    await syncHidden(this,state);
    this.setTheme(this.theme??'dark',state.structures.find(s=>s.structureId===state.activeStructureId)?.display);
  }
}
