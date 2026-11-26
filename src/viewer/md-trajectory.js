import { parseDcd } from 'molstar/lib/mol-io/reader/dcd/parser';
import { parseXtc } from 'molstar/lib/mol-io/reader/xtc/parser';
import { coordinatesFromDcd } from 'molstar/lib/mol-model-formats/structure/dcd';
import { coordinatesFromXtc } from 'molstar/lib/mol-model-formats/structure/xtc';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { Task } from 'molstar/lib/mol-task';
import { extractResidues } from './selection.js';
import { failure } from '../shared/model.js';

// Bounds are checked before the native decoder allocates coordinate arrays.
// Large production trajectories should be stripped/strided offline first.
export const MD_LIMITS = Object.freeze({ maxBytes: 64 * 1024 * 1024, maxAtoms: 100000, maxFrames: 1000, maxAtomFrames: 5000000 });
const invalid = message => failure('INVALID_ARGUMENT', message);
const unsupported = message => failure('UNSUPPORTED_CAPABILITY', message);
function need(condition, message) { if (!condition) throw invalid(message); }
function bounded(atoms, frames, limits) {
  need(Number.isInteger(atoms) && atoms > 0, 'Trajectory atom count must be positive');
  need(Number.isInteger(frames) && frames > 0, 'Trajectory contains no frames');
  if (atoms > limits.maxAtoms || frames > limits.maxFrames || atoms * frames > limits.maxAtomFrames) {
    throw unsupported(`Trajectory exceeds sidebar limits (${limits.maxAtoms} atoms, ${limits.maxFrames} frames, ${limits.maxAtomFrames} atom-frames). Strip solvent and stride frames with VMD or your MD tools before importing.`);
  }
}
function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw invalid('MD coordinates must be binary data');
}

/** Decode host base64 without materializing an iterable of millions of chars. */
export async function decodeTrajectoryBase64(encoded, { preferNative = true, maxBytes = MD_LIMITS.maxBytes, chunkBytes = 3 * 1024 * 1024, yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  need(typeof encoded === 'string' && encoded.length > 0 && encoded.length % 4 === 0, 'Invalid trajectory base64 encoding');
  need(Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= MD_LIMITS.maxBytes, 'Invalid trajectory byte limit');
  need(Number.isInteger(chunkBytes) && chunkBytes >= 3 && chunkBytes <= MD_LIMITS.maxBytes, 'Invalid trajectory decode chunk size');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const length = encoded.length / 4 * 3 - padding;
  if (length > maxBytes) throw unsupported(`Trajectory file exceeds ${Math.floor(maxBytes / 1048576)} MiB. Strip solvent and stride frames before importing.`);
  if (preferNative && typeof Uint8Array.fromBase64 === 'function') {
    try {
      const bytes = Uint8Array.fromBase64(encoded);
      need(bytes.length === length, 'Invalid trajectory base64 byte count');
      return bytes;
    } catch (error) {
      if (error?.code) throw error;
      throw invalid('Invalid trajectory base64 encoding');
    }
  }
  const bytes = new Uint8Array(length), encodedChunk = Math.floor(chunkBytes / 3) * 4;
  let target = 0;
  for (let offset = 0; offset < encoded.length; offset += encodedChunk) {
    const end = Math.min(offset + encodedChunk, encoded.length);
    let binary;
    try { binary = atob(encoded.slice(offset, end)); }
    catch { throw invalid('Invalid trajectory base64 encoding'); }
    need(target + binary.length <= length, 'Invalid trajectory base64 byte count');
    for (let index = 0; index < binary.length; index++) bytes[target++] = binary.charCodeAt(index);
    if (end < encoded.length) await yieldToMain();
  }
  need(target === length, 'Invalid trajectory base64 byte count');
  return bytes;
}

/** Keep topology identity stable across MD frames; frame indices remain in TrajectoryInfo. */
export function stabilizeMdModelIdentity(trajectory, modelNum) {
  need(trajectory && typeof trajectory.getFrameAtIndex === 'function', 'Invalid MD model trajectory');
  const normalize = model => { model.modelNum = modelNum; return model; };
  if (trajectory.representative) normalize(trajectory.representative);
  // Mol* DCD/XTC currently uses eager ArrayTrajectory. Normalize its cache as
  // well as the accessor, so both direct cache and Task-based future access agree.
  if (Array.isArray(trajectory.frames)) for (const model of trajectory.frames) normalize(model);
  const getFrame = trajectory.getFrameAtIndex.bind(trajectory);
  trajectory.getFrameAtIndex = index => {
    const value = getFrame(index);
    return Task.is(value) ? Task.create('Read MD frame', async context => normalize(await Task.resolveInContext(value, context))) : normalize(value);
  };
  return trajectory;
}

/** Inspect record boundaries and allocation sizes without decoding coordinates. */
export function inspectMdTrajectory(data, format, limits = MD_LIMITS) {
  const bytes = bytesOf(data);
  format = String(format).toLowerCase();
  if (!['dcd', 'xtc'].includes(format)) throw unsupported('Import DCD or XTC coordinates with a matching PDB/mmCIF topology');
  if (bytes.byteLength > limits.maxBytes) throw unsupported(`Trajectory file exceeds ${Math.floor(limits.maxBytes / 1048576)} MiB. Strip solvent and stride frames before importing.`);
  need(bytes.byteLength >= (format === 'dcd' ? 104 : 56), `Truncated ${format.toUpperCase()} file`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === 'dcd') {
    if (view.getInt32(0, false) === 84) throw unsupported('Big-endian DCD is not supported by this importer; convert it to little-endian DCD or XTC first');
    need(view.getInt32(0, true) === 84 && view.getInt32(88, true) === 84, 'Invalid DCD header');
    need(String.fromCharCode(...bytes.subarray(4, 8)) === 'CORD', 'DCD must contain CORD coordinates');
    const frames = view.getInt32(8, true), fixed = view.getInt32(40, true);
    if (fixed !== 0) throw unsupported('DCD fixed-atom trajectories require conversion to a full-coordinate DCD or XTC');
    const extra = view.getInt32(48, true) !== 0, fourDims = view.getInt32(52, true) === 1;
    let offset = 92;
    function record(expected) {
      need(offset + 8 <= bytes.length, 'Truncated DCD record');
      const size = view.getInt32(offset, true);
      need(size >= 0 && size % 4 === 0 && offset + size + 8 <= bytes.length, 'Invalid DCD record length');
      need(expected == null || size === expected, 'Unexpected DCD coordinate record length');
      need(view.getInt32(offset + size + 4, true) === size, 'DCD record markers do not match');
      const start = offset + 4; offset += size + 8;
      return { start, size };
    }
    const title = record();
    need(title.size >= 4 && (title.size - 4) % 80 === 0, 'Invalid DCD title record');
    need(view.getInt32(title.start, true) === (title.size - 4) / 80, 'Invalid DCD title count');
    const atomRecord = record(4), atoms = view.getInt32(atomRecord.start, true);
    bounded(atoms, frames, limits);
    for (let frame = 0; frame < frames; frame++) {
      if (extra) record(48);
      for (let axis = 0; axis < 3; axis++) record(atoms * 4);
      if (fourDims) record(atoms * 4);
    }
    need(offset === bytes.length, 'DCD frame count does not match its file length');
    return { format, atomCount: atoms, frameCount: frames, byteLength: bytes.length };
  }
  let offset = 0, atomCount = 0, frameCount = 0;
  while (offset < bytes.length) {
    need(offset + 56 <= bytes.length, 'Truncated XTC frame header');
    need(view.getInt32(offset) === 1995, 'Invalid XTC magic number');
    const atoms = view.getInt32(offset + 4), count = view.getInt32(offset + 52);
    need(count === atoms, 'XTC coordinate count does not match its frame header');
    if (!atomCount) atomCount = atoms;
    need(atoms === atomCount, 'XTC atom count changes between frames');
    bounded(atoms, ++frameCount, limits);
    need(Number.isFinite(view.getFloat32(offset + 12)), 'XTC frame time must be finite');
    for (let axis = 0; axis < 9; axis++) need(Number.isFinite(view.getFloat32(offset + 16 + axis * 4)), 'XTC box must be finite');
    if (atoms <= 9) {
      offset += 56 + atoms * 12;
      need(offset <= bytes.length, 'Truncated XTC coordinate record');
    } else {
      need(offset + 92 <= bytes.length, 'Truncated compressed XTC header');
      const precision = view.getFloat32(offset + 56), smallIndex = view.getInt32(offset + 84), packed = view.getInt32(offset + 88);
      need(Number.isFinite(precision) && precision > 0, 'Invalid XTC precision');
      need(smallIndex >= 9 && smallIndex <= 72, 'Invalid XTC compression index');
      for (let axis = 0; axis < 3; axis++) {
        const width = view.getInt32(offset + 72 + axis * 4) - view.getInt32(offset + 60 + axis * 4) + 1;
        need(width > 0 && width <= 0x7fffffff, 'Invalid XTC compressed coordinate range');
      }
      need(packed > 0 && packed <= bytes.length - offset - 92, 'Invalid XTC packed record length');
      offset += 92 + Math.ceil(packed / 4) * 4;
      need(offset <= bytes.length, 'Truncated XTC record padding');
    }
  }
  return { format, atomCount, frameCount, byteLength: bytes.length };
}

export function validateMdCoordinates(coordinates, info, expectedAtoms) {
  if (expectedAtoms != null && info.atomCount !== expectedAtoms) throw invalid(`Topology has ${expectedAtoms} atoms; trajectory has ${info.atomCount}. Both files must use identical atoms in identical order.`);
  need(coordinates?.frames?.length === info.frameCount, 'Decoded trajectory frame count does not match its records');
  for (const [index, frame] of coordinates.frames.entries()) {
    need(frame.elementCount === info.atomCount, `Atom count mismatch in frame ${index + 1}`);
    for (const axis of ['x', 'y', 'z']) {
      need(frame[axis]?.length === info.atomCount, `Missing coordinates in frame ${index + 1}`);
      for (const value of frame[axis]) need(Number.isFinite(value), `Nonfinite coordinates in frame ${index + 1}`);
    }
  }
  return coordinates;
}

/** Native Mol* decoding, also available for non-WebGL callers and regression tests. */
export async function parseMdCoordinates(data, format, expectedAtoms) {
  const info = inspectMdTrajectory(data, format);
  if (expectedAtoms != null && info.atomCount !== expectedAtoms) throw invalid(`Topology has ${expectedAtoms} atoms; trajectory has ${info.atomCount}. Both files must use identical atoms in identical order.`);
  // DCD's native decoder reads the whole backing buffer and may swap endian bytes.
  // An owned exact-size copy avoids subarray offsets and mutation of caller data.
  const bytes = bytesOf(data).slice();
  const parsed = await (info.format === 'dcd' ? parseDcd(bytes) : parseXtc(bytes)).run();
  if (parsed.isError) throw invalid(`Cannot parse ${info.format.toUpperCase()}: ${parsed.message}`);
  const coordinates = await (info.format === 'dcd' ? coordinatesFromDcd(parsed.result) : coordinatesFromXtc(parsed.result)).run();
  validateMdCoordinates(coordinates, info, expectedAtoms);
  return { coordinates, info };
}

/**
 * Attach a bounded binary trajectory to an already loaded topology. Call through
 * engine.displayQueue. The topology source stays alive as a dependency; replaced
 * coordinate/trajectory trees are removed. The caller persists the source and
 * clears stale selection/layer records in workspace state.
 */
export async function attachMdTrajectory(engine, args) {
  const sid = String(args.structureId), plugin = engine.plugin;
  const previous = engine.trajectories.get(sid), structure = engine.structures.get(sid);
  if (!structure || !previous) throw failure('TARGET_NOT_FOUND', 'Load the matching PDB/mmCIF topology first');
  if (args.atomOrderConfirmed !== true) throw invalid('Confirm that topology and trajectory contain the same atoms in the same order');
  const info = inspectMdTrajectory(args.data, args.format);
  const baseModelRef = previous.baseModelRef ?? engine.models.get(sid);
  const topology = plugin.state.data.cells.get(baseModelRef)?.obj?.data;
  if (!topology?.atomicHierarchy) throw invalid('Trajectory topology model is unavailable');
  const expectedAtoms = topology.atomicHierarchy.atoms._rowCount;
  if (info.atomCount !== expectedAtoms) throw invalid(`Topology has ${expectedAtoms} atoms; trajectory has ${info.atomCount}. Both files must use identical atoms in identical order.`);
  let raw, trajectory, result;
  try {
    raw = await plugin.builders.data.rawData({ data: bytesOf(args.data).slice(), label: args.title || `${info.format.toUpperCase()} trajectory` });
    const coordinates = await plugin.state.data.build().to(raw).apply(info.format === 'dcd' ? StateTransforms.Model.CoordinatesFromDcd : StateTransforms.Model.CoordinatesFromXtc).commit();
    validateMdCoordinates(coordinates.obj?.data, info, expectedAtoms);
    trajectory = await plugin.state.data.build().toRoot().apply(StateTransforms.Model.TrajectoryFromModelAndCoordinates, { modelRef: baseModelRef, coordinatesRef: coordinates.ref }).commit();
    stabilizeMdModelIdentity(trajectory.obj.data, topology.modelNum);
    // Explicit model (not assembly) keeps MD atom coordinates and atom counts exact.
    // Low quality polymer/ligand graphics avoid per-frame surface reconstruction.
    result = await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
      structure: { name: 'model', params: {} }, showUnitcell: false,
      representationPreset: 'polymer-and-ligand', representationPresetParams: { quality: 'low' },
    });
    const selector = result?.structureProperties?.obj ? result.structureProperties : result?.structure;
    const current = selector?.obj?.data;
    if (!current) throw failure('EXECUTION_FAILED', 'No MD structure was produced');
    const update = plugin.state.data.build();
    if (previous.md) {
      update.delete(previous.ref);
      if (previous.rawRef) update.delete(previous.rawRef);
    } else {
      const old = engine.structureNode(sid);
      if (old?.cell?.transform?.ref) update.delete(old.cell.transform.ref);
      else if (engine.structureRefs.get(sid)) update.delete(engine.structureRefs.get(sid));
    }
    await update.commit();
    engine.structures.set(sid, current);
    engine.structureRefs.set(sid, selector.ref);
    engine.models.set(sid, result.model.ref);
    engine.residues.set(sid, extractResidues(current));
    engine.displayCache.delete(sid);
    engine.potentialCache?.clear();
    const meta = { ...info, structureId: sid, frame: 0, ref: trajectory.ref, rawRef: raw.ref, baseModelRef, md: true, title: args.title || `${info.format.toUpperCase()} trajectory` };
    engine.trajectories.set(sid, meta);
    return meta;
  } catch (error) {
    const update = plugin.state.data.build();
    if (trajectory?.ref) update.delete(trajectory.ref);
    if (raw?.ref) update.delete(raw.ref);
    await update.commit().catch(() => {});
    throw error;
  }
}

/**
 * One frame commit at a time. Wall-clock scheduling drops overdue display frames
 * instead of queuing them, keeping controls responsive on slower machines.
 */
export function createFramePlayback({ setFrame, onFrame = () => {}, onError = () => {}, request = cb => requestAnimationFrame(cb), cancel = id => cancelAnimationFrame(id), now = () => performance.now() }) {
  let generation = 0, handle = null, work = null, playing = false, options;
  let metrics = { startedAt: 0, stoppedAt: 0, completedFrames: 0, skippedFrames: 0, totalCommitMs: 0 };
  const stats = () => { const elapsedMs = Math.max(0, (playing ? now() : metrics.stoppedAt) - metrics.startedAt); return { completedFrames: metrics.completedFrames, skippedFrames: metrics.skippedFrames, elapsedMs, updatesPerSecond: elapsedMs > 0 ? metrics.completedFrames * 1000 / elapsedMs : 0, meanCommitMs: metrics.completedFrames ? metrics.totalCommitMs / metrics.completedFrames : 0 }; };
  function stop() {
    generation++; if (playing) metrics.stoppedAt = now(); playing = false;
    if (handle != null) cancel(handle);
    handle = null;
  }
  function play({ frame = 0, frameCount, fps = 12, loop = true }) {
    need(Number.isInteger(frameCount) && frameCount > 1, 'Playback requires at least two frames');
    need(Number.isInteger(frame) && frame >= 0 && frame < frameCount, 'Playback frame is out of range');
    need(Number.isFinite(fps) && fps >= 1 && fps <= 30, 'Playback FPS must be between 1 and 30');
    stop(); playing = true;
    options = { frame, frameCount, fps, loop };
    const token = generation, start = now();
    metrics = { startedAt: start, stoppedAt: start, completedFrames: 0, skippedFrames: 0, totalCommitMs: 0 };
    let displayed = frame, committedAdvance = 0;
    function tick() {
      handle = null;
      if (!playing || token !== generation) return;
      const advance = Math.floor(Math.max(0, now() - start) * fps / 1000);
      const end = frame + advance, target = loop ? end % frameCount : Math.min(end, frameCount - 1);
      if (!work && target !== displayed) {
        const commitStarted = now();
        work = Promise.resolve().then(() => setFrame(target)).then(value => {
          displayed = target;
          if (token === generation) {
            const actualAdvance = loop ? advance : Math.min(advance, frameCount - 1 - frame);
            metrics.completedFrames++; metrics.skippedFrames += Math.max(0, actualAdvance - committedAdvance - 1);
            metrics.totalCommitMs += Math.max(0, now() - commitStarted); committedAdvance = actualAdvance;
            onFrame(value, target, stats());
          }
          if (!loop && target === frameCount - 1 && token === generation) stop();
        }).catch(error => {
          if (token === generation) { stop(); onError(error); }
        }).finally(() => { work = null; });
      }
      if (playing && token === generation) handle = request(tick);
    }
    handle = request(tick);
  }
  return {
    play,
    async pause() { stop(); await work; },
    dispose: stop,
    get playing() { return playing; },
    get pending() { return work; },
    get options() { return options; },
    get stats() { return stats(); },
  };
}
